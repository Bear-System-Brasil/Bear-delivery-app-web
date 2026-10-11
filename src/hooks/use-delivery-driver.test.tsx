import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { io } from "socket.io-client";
import { apiService, PaymentMethod, PaymentStatus, type Delivery } from "@/services/api";
import { socketAuthProvider } from "@/lib/socket-auth";
import { useAuthStore } from "@/stores";
import { useCourierPositionStore } from "@/stores/courier-position-store";
import { useDeliveryDriver, useDeliveryHistory } from "./use-delivery-driver";

// A URL do socket é lida quando o módulo carrega: precisa existir antes do import.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
});

const { sound, fakeSocket } = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  const handlers = new Map<string, Handler>();
  return {
    sound: { muted: false, play: vi.fn(), toggleMuted: vi.fn() },
    fakeSocket: {
      handlers,
      on: vi.fn((event: string, handler: Handler) => {
        handlers.set(event, handler);
      }),
      emit: vi.fn(),
      disconnect: vi.fn(),
      fire(event: string, ...args: unknown[]) {
        handlers.get(event)?.(...args);
      },
    },
  };
});

vi.mock("socket.io-client", () => ({ io: vi.fn(() => fakeSocket) }));

vi.mock("@/hooks/use-sound", () => ({
  useSound: () => ({
    play: sound.play,
    muted: sound.muted,
    toggleMuted: sound.toggleMuted,
  }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    apiService: {
      deliveries: {
        getMyDeliveries: vi.fn(),
        updateStatus: vi.fn(),
        cancel: vi.fn(),
        returnToPool: vi.fn(),
      },
      payments: {
        update: vi.fn(),
      },
    },
  };
});

const deliveries = vi.mocked(apiService.deliveries);
const payments = vi.mocked(apiService.payments);

const MINUTE = 60_000;

// Só os campos que os agrupamentos leem; o resto do Delivery não importa aqui.
const delivery = (
  id: string,
  status: Delivery["status"],
  extra: Partial<Delivery> = {},
) =>
  ({
    id,
    orderId: `order-${id}`,
    status,
    created_at: new Date(Date.now() - 30 * MINUTE).toISOString(),
    updated_at: new Date(Date.now() - 5 * MINUTE).toISOString(),
    ...extra,
  }) as Delivery;

// O que o backend devolve em GET /delivery/delivery-person/me.
let server: Delivery[] = [];
let totalPages = 1;

const watchPosition = vi.fn();
const clearWatch = vi.fn();

const initialAuthState = useAuthStore.getState();
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function renderDriver() {
  const hook = renderHook(() => useDeliveryDriver(), { wrapper });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

describe("useDeliveryDriver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeSocket.handlers.clear();
    sound.muted = false;
    server = [];
    totalPages = 1;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    useAuthStore.setState({ ...initialAuthState, isAuthenticated: true }, true);
    useCourierPositionStore.setState({ position: null });
    deliveries.getMyDeliveries.mockImplementation(async () => ({
      success: true,
      data: {
        data: server,
        meta: { page: 1, limit: 100, total: server.length, totalPages },
      },
    }));
    watchPosition.mockReturnValue(7);
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { watchPosition, clearWatch },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  // LDMF-322: o backend devolve pendentes de todos os restaurantes, mas o
  // entregador vinculado a um restaurante só pode pegar as dele.
  describe("restaurante do entregador", () => {
    const from = (
      id: string,
      status: Delivery["status"],
      order: Record<string, unknown> | undefined,
    ) => delivery(id, status, { order } as unknown as Partial<Delivery>);

    const loginAs = (companyId?: string) =>
      useAuthStore.setState(
        {
          ...initialAuthState,
          isAuthenticated: true,
          user: { id: "u1", role: "delivery", companyId } as never,
        },
        true,
      );

    it("vinculado a um restaurante, só vê disponíveis dele", async () => {
      loginAs("pastelaria");
      server = [
        from("minha", "PENDING", { company: { id: "pastelaria" } }),
        from("outra", "PENDING", { company: { id: "xurupita" } }),
        from("so-id", "PENDING", { companyId: "pastelaria" }),
        from("sem-restaurante", "PENDING", undefined),
      ];

      const { result } = await renderDriver();

      expect(result.current.availableDeliveries.map((d) => d.id).sort()).toEqual([
        "minha",
        "so-id",
      ]);
      expect(result.current.counts.available).toBe(2);
    });

    it("o que ele já aceitou de outro restaurante continua com ele", async () => {
      loginAs("pastelaria");
      server = [from("aceita-antes", "ACCEPTED", { company: { id: "decasa" } })];

      const { result } = await renderDriver();

      expect(result.current.myDeliveries.map((d) => d.id)).toEqual(["aceita-antes"]);
    });

    it("sem restaurante (entregador livre), vê tudo como antes", async () => {
      loginAs(undefined);
      server = [
        from("a", "PENDING", { company: { id: "pastelaria" } }),
        from("b", "PENDING", { company: { id: "xurupita" } }),
      ];

      const { result } = await renderDriver();

      expect(result.current.availableDeliveries).toHaveLength(2);
    });
  });

  describe("carga e agrupamento", () => {
    it("pede uma página só, no tamanho máximo que o backend aceita", async () => {
      await renderDriver();

      expect(deliveries.getMyDeliveries).toHaveBeenCalledWith({ page: 1, limit: 100 });
    });

    it("separa minhas, entregues na última hora e disponíveis", async () => {
      server = [
        delivery("a1", "ACCEPTED"),
        delivery("p1", "PICKED_UP"),
        delivery("d1", "DELIVERED", { deliveryTime: new Date(Date.now() - 10 * MINUTE).toISOString() }),
        delivery("d-velha", "DELIVERED", { deliveryTime: new Date(Date.now() - 3 * 60 * MINUTE).toISOString() }),
        delivery("n1", "PENDING"),
        delivery("x1", "CANCELED"),
      ];

      const { result } = await renderDriver();

      // PICKED_UP antes de ACCEPTED: é a corrida que já está na rua.
      expect(result.current.myDeliveries.map((d) => d.id)).toEqual(["p1", "a1"]);
      expect(result.current.recentlyDelivered.map((d) => d.id)).toEqual(["d1"]);
      expect(result.current.availableDeliveries.map((d) => d.id)).toEqual(["n1"]);
      expect(result.current.counts).toEqual({
        mine: 2,
        inRoute: 1,
        toPickUp: 1,
        recent: 1,
        available: 1,
      });
    });

    it("separa em rota (PICKED_UP) de a coletar (ACCEPTED), na ordem de chegada", async () => {
      server = [
        delivery("a1", "ACCEPTED", { created_at: new Date(Date.now() - 5 * MINUTE).toISOString() }),
        delivery("p2", "PICKED_UP", { created_at: new Date(Date.now() - 2 * MINUTE).toISOString() }),
        delivery("a2", "ACCEPTED", { created_at: new Date(Date.now() - 1 * MINUTE).toISOString() }),
        delivery("p1", "PICKED_UP", { created_at: new Date(Date.now() - 8 * MINUTE).toISOString() }),
        delivery("n1", "PENDING"),
      ];

      const { result } = await renderDriver();

      expect(result.current.inRouteDeliveries.map((d) => d.id)).toEqual(["p1", "p2"]);
      expect(result.current.toPickUpDeliveries.map((d) => d.id)).toEqual(["a1", "a2"]);
    });

    it("aceita a resposta como array cru, sem o envelope", async () => {
      deliveries.getMyDeliveries.mockResolvedValue({
        success: true,
        data: [delivery("n1", "PENDING")],
      });

      const { result } = await renderDriver();

      expect(result.current.availableDeliveries.map((d) => d.id)).toEqual(["n1"]);
      expect(result.current.hasMorePages).toBe(false);
    });

    it("avisa quando há mais entregas do que cabem na página", async () => {
      server = [delivery("n1", "PENDING")];
      totalPages = 2;

      const { result } = await renderDriver();

      expect(result.current.hasMorePages).toBe(true);
      expect(result.current.meta?.totalPages).toBe(2);
    });

    it("falha da API vira isError", async () => {
      deliveries.getMyDeliveries.mockResolvedValue({ success: false, message: "Sem permissão" });

      const { result } = await renderDriver();

      expect(result.current.isError).toBe(true);
      expect(result.current.myDeliveries).toEqual([]);
    });

    it("sem login não consulta", () => {
      useAuthStore.setState({ ...initialAuthState, isAuthenticated: false }, true);

      renderHook(() => useDeliveryDriver(), { wrapper });

      expect(deliveries.getMyDeliveries).not.toHaveBeenCalled();
    });

    it("entrega fechada sai de 'última hora' com o tique de um minuto, sem nova requisição", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        server = [
          delivery("d1", "DELIVERED", { deliveryTime: new Date(Date.now() - 59 * MINUTE).toISOString() }),
        ];
        const { result } = await renderDriver();
        expect(result.current.recentlyDelivered.map((d) => d.id)).toEqual(["d1"]);

        // O poll de 15s roda junto, mas devolve a mesma lista: só o tique
        // de um minuto faz a entrega sair do grupo.
        await act(async () => {
          vi.advanceTimersByTime(2 * MINUTE);
        });

        expect(result.current.recentlyDelivered).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("alerta de entrega nova", () => {
    it("não toca na primeira carga, mesmo com entregas na fila", async () => {
      server = [delivery("n1", "PENDING")];

      await renderDriver();

      expect(sound.play).not.toHaveBeenCalled();
    });

    it("toca quando aparece uma disponível nova", async () => {
      server = [delivery("n1", "PENDING")];
      const { result } = await renderDriver();

      server = [delivery("n1", "PENDING"), delivery("n2", "PENDING")];
      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => expect(sound.play).toHaveBeenCalledWith("new-job"));
      expect(sound.play).toHaveBeenCalledTimes(1);
    });

    it("não toca quando uma disponível só sai da fila", async () => {
      server = [delivery("n1", "PENDING"), delivery("n2", "PENDING")];
      const { result } = await renderDriver();

      server = [delivery("n1", "PENDING")];
      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => expect(result.current.availableDeliveries).toHaveLength(1));
      expect(sound.play).not.toHaveBeenCalled();
    });

    it("com o som mudo, não toca", async () => {
      sound.muted = true;
      const { result } = await renderDriver();

      server = [delivery("n2", "PENDING")];
      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => expect(result.current.availableDeliveries).toHaveLength(1));
      expect(sound.play).not.toHaveBeenCalled();
      expect(result.current.soundEnabled).toBe(false);
    });

    it("a primeira resposta que chega vazia ainda conta como primeira carga", async () => {
      const { result } = await renderDriver();

      server = [delivery("n1", "PENDING")];
      await act(async () => {
        await result.current.refetch();
      });

      // Primeira carga veio vazia; a entrega que chega depois é nova de verdade.
      await waitFor(() => expect(sound.play).toHaveBeenCalledWith("new-job"));
    });
  });

  describe("rastreamento ao vivo", () => {
    it("não abre socket nem GPS sem corrida PICKED_UP", async () => {
      server = [delivery("a1", "ACCEPTED"), delivery("n1", "PENDING")];

      await renderDriver();

      expect(io).not.toHaveBeenCalled();
      expect(watchPosition).not.toHaveBeenCalled();
    });

    it("com corrida PICKED_UP, conecta e entra na sala da entrega", async () => {
      server = [delivery("p1", "PICKED_UP")];

      await renderDriver();

      expect(io).toHaveBeenCalledWith("http://api.test/delivery-tracking", {
        auth: socketAuthProvider,
      });
      act(() => fakeSocket.fire("connect"));
      expect(fakeSocket.emit).toHaveBeenCalledWith("joinDelivery", { deliveryId: "p1" });
    });

    it("cada leitura do GPS vai pelo socket e alimenta a posição do aceite", async () => {
      server = [delivery("p1", "PICKED_UP")];
      await renderDriver();

      const onPosition = watchPosition.mock.calls[0][0] as PositionCallback;
      act(() =>
        onPosition({
          coords: { latitude: -23.5, longitude: -46.6 },
        } as GeolocationPosition),
      );

      expect(fakeSocket.emit).toHaveBeenCalledWith("updateLocation", {
        deliveryId: "p1",
        lat: -23.5,
        lng: -46.6,
      });
      expect(useCourierPositionStore.getState().position).toMatchObject({
        coords: { lat: -23.5, lng: -46.6 },
        source: "tracking",
      });
    });

    it("com várias na rua, transmite a que saiu primeiro", async () => {
      server = [
        delivery("p-nova", "PICKED_UP", { created_at: new Date(Date.now() - 5 * MINUTE).toISOString() }),
        delivery("p-velha", "PICKED_UP", { created_at: new Date(Date.now() - 50 * MINUTE).toISOString() }),
      ];

      await renderDriver();
      act(() => fakeSocket.fire("connect"));

      expect(fakeSocket.emit).toHaveBeenCalledWith("joinDelivery", { deliveryId: "p-velha" });
    });

    it("quando a corrida é entregue, fecha o socket e para o GPS", async () => {
      server = [delivery("p1", "PICKED_UP")];
      const { result } = await renderDriver();

      server = [delivery("p1", "DELIVERED")];
      await act(async () => {
        await result.current.refetch();
      });

      await waitFor(() => expect(fakeSocket.disconnect).toHaveBeenCalled());
      expect(clearWatch).toHaveBeenCalledWith(7);
    });

    it("sem geolocalização no navegador, o socket abre do mesmo jeito", async () => {
      Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
      server = [delivery("p1", "PICKED_UP")];

      const { unmount } = await renderDriver();

      expect(io).toHaveBeenCalled();
      unmount();
      expect(fakeSocket.disconnect).toHaveBeenCalled();
      expect(clearWatch).not.toHaveBeenCalled();
    });
  });

  describe("ações", () => {
    it("aceitar leva a posição do entregador e avisa o sucesso", async () => {
      deliveries.updateStatus.mockResolvedValue({ success: true });
      const { result } = await renderDriver();

      act(() => result.current.acceptDelivery({ id: "n1", coords: { lat: 1, lng: 2 } }));

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Entrega aceita!"));
      expect(deliveries.updateStatus).toHaveBeenCalledWith("n1", "ACCEPTED", { lat: 1, lng: 2 });
      expect(sound.play).toHaveBeenCalledWith("success");
    });

    it("aceite recusado sem mensagem sugere que outro entregador pegou", async () => {
      deliveries.updateStatus.mockResolvedValue({ success: false });
      const { result } = await renderDriver();

      act(() => result.current.acceptDelivery({ id: "n1", coords: { lat: 1, lng: 2 } }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "Não foi possível aceitar - talvez outro entregador já tenha pegado essa.",
        ),
      );
      expect(sound.play).not.toHaveBeenCalledWith("success");
    });

    it("aceite recusado descarta a posição digitada que foi enviada (LDMF-314)", async () => {
      useCourierPositionStore.getState().setPosition({ lat: 1, lng: 2 }, "manual", "Rua X");
      deliveries.updateStatus.mockResolvedValue({ success: false, message: "recusado" });
      const { result } = await renderDriver();

      act(() => result.current.acceptDelivery({ id: "n1", coords: { lat: 1, lng: 2 } }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("recusado"));
      expect(useCourierPositionStore.getState().position).toBeNull();
    });

    it("aceite recusado mantém posição do GPS e posição manual diferente da enviada", async () => {
      deliveries.updateStatus.mockResolvedValue({ success: false });
      const { result } = await renderDriver();

      useCourierPositionStore.getState().setPosition({ lat: 1, lng: 2 }, "gps");
      act(() => result.current.acceptDelivery({ id: "n1", coords: { lat: 1, lng: 2 } }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
      expect(useCourierPositionStore.getState().position?.source).toBe("gps");

      useCourierPositionStore.getState().setPosition({ lat: 3, lng: 4 }, "manual", "Outra");
      act(() => result.current.acceptDelivery({ id: "n1", coords: { lat: 1, lng: 2 } }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2));
      expect(useCourierPositionStore.getState().position?.label).toBe("Outra");
    });

    it("erro de conexão no aceite não descarta a posição digitada", async () => {
      useCourierPositionStore.getState().setPosition({ lat: 1, lng: 2 }, "manual", "Rua X");
      deliveries.updateStatus.mockRejectedValue(new Error("offline"));
      const { result } = await renderDriver();

      act(() => result.current.acceptDelivery({ id: "n1", coords: { lat: 1, lng: 2 } }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Erro de conexão ao aceitar entrega"),
      );
      expect(useCourierPositionStore.getState().position?.source).toBe("manual");
    });

    it("aceite com exceção de rede avisa erro de conexão", async () => {
      deliveries.updateStatus.mockRejectedValue(new Error("offline"));
      const { result } = await renderDriver();

      act(() => result.current.acceptDelivery({ id: "n1", coords: { lat: 1, lng: 2 } }));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Erro de conexão ao aceitar entrega"),
      );
    });

    it("marca só a entrega que está sendo aceita como pendente", async () => {
      deliveries.updateStatus.mockReturnValue(new Promise(() => {}));
      const { result } = await renderDriver();

      act(() => result.current.acceptDelivery({ id: "n1", coords: { lat: 1, lng: 2 } }));

      await waitFor(() => expect(result.current.acceptingId).toBe("n1"));
      expect(result.current.advancingId).toBeNull();
      expect(result.current.returningId).toBeNull();
    });

    it("concluir a entrega avisa; coletar não mostra toast de sucesso", async () => {
      deliveries.updateStatus.mockResolvedValue({ success: true });
      const { result } = await renderDriver();

      act(() => result.current.advanceDelivery({ id: "a1", next: "PICKED_UP" }));
      await waitFor(() => expect(deliveries.updateStatus).toHaveBeenCalledWith("a1", "PICKED_UP"));
      await waitFor(() => expect(sound.play).toHaveBeenCalledWith("success"));
      expect(toast.success).not.toHaveBeenCalled();

      act(() => result.current.advanceDelivery({ id: "p1", next: "DELIVERED" }));
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Entrega concluída!"));
    });

    it("avanço recusado sem mensagem usa o texto de cada etapa", async () => {
      deliveries.updateStatus.mockResolvedValue({ success: false });
      const { result } = await renderDriver();

      act(() => result.current.advanceDelivery({ id: "a1", next: "PICKED_UP" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Erro ao marcar como coletado"));

      act(() => result.current.advanceDelivery({ id: "p1", next: "DELIVERED" }));
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Erro ao marcar como entregue"));
    });

    it("avanço recusado com mensagem do backend mostra a mensagem", async () => {
      deliveries.updateStatus.mockResolvedValue({ success: false, message: "Já entregue" });
      const { result } = await renderDriver();

      act(() => result.current.advanceDelivery({ id: "p1", next: "DELIVERED" }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Já entregue"));
    });

    it("devolver manda o motivo, não cancela, e avisa o sucesso", async () => {
      deliveries.returnToPool.mockResolvedValue({ success: true });
      const { result } = await renderDriver();

      act(() => result.current.returnDelivery({ id: "a1", reason: "pneu furado" }));

      await waitFor(() =>
        expect(toast.success).toHaveBeenCalledWith(
          "Entrega devolvida - outro entregador pode aceitar",
        ),
      );
      expect(deliveries.returnToPool).toHaveBeenCalledWith("a1", "pneu furado");
      expect(deliveries.cancel).not.toHaveBeenCalled();
    });

    it("devolução recusada mostra o erro", async () => {
      deliveries.returnToPool.mockResolvedValue({ success: false });
      const { result } = await renderDriver();

      act(() => result.current.returnDelivery({ id: "a1", reason: "pneu furado" }));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Erro ao devolver entrega"));
    });

    it("gerência manda o corpo recebido para o PATCH do pagamento", async () => {
      payments.update.mockResolvedValue({ success: true });
      const { result } = await renderDriver();
      const update = {
        orderId: "order-a1",
        customerId: "cus-1",
        amount: 35.9,
        paymentMethod: PaymentMethod.CREDIT_CARD,
        status: PaymentStatus.PENDING,
      };

      await act(async () => {
        await result.current.changePaymentMethod({
          deliveryId: "a1",
          paymentId: "pay-1",
          update,
        });
      });

      expect(payments.update).toHaveBeenCalledWith("pay-1", update);
      expect(toast.success).toHaveBeenCalledWith("Forma de pagamento alterada");
    });

    it("alteração recusada pelo backend mostra o motivo", async () => {
      payments.update.mockResolvedValue({ success: false, message: "Sem permissão" });
      const { result } = await renderDriver();

      await act(async () => {
        await result.current.changePaymentMethod({
          deliveryId: "a1",
          paymentId: "pay-1",
          update: { paymentMethod: PaymentMethod.PIX },
        });
      });

      expect(toast.error).toHaveBeenCalledWith("Sem permissão");
    });

    // A rota do aviso ainda não existe (LDMF-284): nada pode sair para a API.
    it("o aviso ao gerente não chama rota nenhuma enquanto o backend não existe", async () => {
      const { result } = await renderDriver();

      let response: { success: boolean } | undefined;
      await act(async () => {
        response = await result.current.requestPaymentChange({
          deliveryId: "a1",
          orderId: "order-a1",
          paymentId: "pay-1",
          paymentMethod: PaymentMethod.PIX,
        });
      });

      expect(response?.success).toBe(false);
      expect(payments.update).not.toHaveBeenCalled();
      expect(toast.error).toHaveBeenCalled();
    });

    it("toda ação, mesmo recusada, atualiza a lista", async () => {
      deliveries.updateStatus.mockResolvedValue({ success: false });
      const { result } = await renderDriver();
      const before = deliveries.getMyDeliveries.mock.calls.length;

      act(() => result.current.acceptDelivery({ id: "n1", coords: { lat: 1, lng: 2 } }));

      await waitFor(() =>
        expect(deliveries.getMyDeliveries.mock.calls.length).toBeGreaterThan(before),
      );
    });
  });
});

describe("useDeliveryHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    useAuthStore.setState({ ...initialAuthState, isAuthenticated: true }, true);
  });

  it("lista só concluídas e canceladas, da mais recente para a mais antiga, sem abrir socket", async () => {
    deliveries.getMyDeliveries.mockResolvedValue({
      success: true,
      data: {
        data: [
          delivery("d-velha", "DELIVERED", { deliveryTime: "2026-09-01T10:00:00.000Z" }),
          delivery("p1", "PICKED_UP"),
          delivery("x1", "CANCELED", { updated_at: "2026-09-20T10:00:00.000Z" }),
          delivery("n1", "PENDING"),
          delivery("d-nova", "COMPLETED", { deliveryTime: "2026-09-28T10:00:00.000Z" }),
        ],
        meta: { page: 1, limit: 100, total: 5, totalPages: 1 },
      },
    });

    const { result } = renderHook(() => useDeliveryHistory(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.historyDeliveries.map((d) => d.id)).toEqual(["d-nova", "x1", "d-velha"]);
    expect(io).not.toHaveBeenCalled();
  });
});
