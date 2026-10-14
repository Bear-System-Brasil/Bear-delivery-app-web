import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import type { CompanyOrder } from "@/constants/order-management";
import { apiService, type Order } from "@/services/api";
import { useAuthStore } from "@/stores";
import { useOrderManagement } from "./use-order-management";

const { sound } = vi.hoisted(() => ({
  sound: {
    muted: false,
    play: vi.fn(),
    loop: vi.fn(),
    stopLoop: vi.fn(),
    toggleMuted: vi.fn(),
  },
}));

vi.mock("@/hooks/use-sound", () => ({
  useSound: () => ({
    play: sound.play,
    loop: sound.loop,
    stopLoop: sound.stopLoop,
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
      orders: {
        getCompanyOrders: vi.fn(),
        updateOrderStatus: vi.fn(),
        cancelOrder: vi.fn(),
      },
    },
  };
});

const orders = vi.mocked(apiService.orders);

const order = (id: string, status: string, minutesAgo = 10) =>
  ({
    id,
    status,
    created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  }) as unknown as CompanyOrder;

// O que GET /order/company devolve em cada chamada.
let server: CompanyOrder[] = [];

const initialAuthState = useAuthStore.getState();
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function renderLoaded() {
  const hook = renderHook(() => useOrderManagement(), { wrapper });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

async function serverNow(
  result: { current: ReturnType<typeof useOrderManagement> },
  next: CompanyOrder[],
) {
  server = next;
  await act(async () => {
    await result.current.refetch();
  });
  await waitFor(() => expect(result.current.orders).toEqual(next));
}

describe("useOrderManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sound.muted = false;
    server = [];
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    useAuthStore.setState({ ...initialAuthState, isAuthenticated: true }, true);
    orders.getCompanyOrders.mockImplementation(async () => ({
      success: true,
      data: {
        data: server as unknown as Order[],
        meta: { page: 1, limit: 100, total: server.length, totalPages: 1 },
      },
    }));
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe("carga e colunas", () => {
    it("pede a primeira página no limite máximo", async () => {
      await renderLoaded();

      expect(orders.getCompanyOrders).toHaveBeenCalledWith({ page: 1, limit: 100 });
    });

    it("agrupa por coluna, com cancelados junto dos concluídos", async () => {
      server = [
        order("n1", "ORDERED"),
        order("p1", "IN_PRODUCTION"),
        order("r1", "READY_FOR_PICKUP"),
        order("c1", "COMPLETED"),
        order("x1", "CANCELED"),
      ];

      const { result } = await renderLoaded();

      expect(result.current.columns.new.map((o) => o.id)).toEqual(["n1"]);
      expect(result.current.columns.preparing.map((o) => o.id)).toEqual(["p1"]);
      expect(result.current.columns.ready.map((o) => o.id)).toEqual(["r1"]);
      expect(result.current.columns.completed.map((o) => o.id).sort()).toEqual(["c1", "x1"]);
      expect(result.current.statusCounts).toEqual({
        new: 1,
        preparing: 1,
        ready: 1,
        completed: 2,
        total: 5,
      });
    });

    it("Novos e Concluídos: mais recentes primeiro; Em preparo e Prontos: mais antigos primeiro", async () => {
      server = [
        order("n-velho", "ORDERED", 30),
        order("n-novo", "ORDERED", 1),
        order("p-novo", "IN_PRODUCTION", 2),
        order("p-velho", "IN_PRODUCTION", 40),
        order("r-novo", "READY_FOR_PICKUP", 3),
        order("r-velho", "READY_FOR_PICKUP", 50),
        order("c-velho", "COMPLETED", 90),
        order("c-novo", "COMPLETED", 5),
      ];

      const { result } = await renderLoaded();

      expect(result.current.columns.new.map((o) => o.id)).toEqual(["n-novo", "n-velho"]);
      expect(result.current.columns.preparing.map((o) => o.id)).toEqual(["p-velho", "p-novo"]);
      expect(result.current.columns.ready.map((o) => o.id)).toEqual(["r-velho", "r-novo"]);
      expect(result.current.columns.completed.map((o) => o.id)).toEqual(["c-novo", "c-velho"]);
    });

    it("falha da API vira isError e quadro vazio", async () => {
      orders.getCompanyOrders.mockResolvedValue({ success: false, message: "Sem empresa" });

      const { result } = renderHook(() => useOrderManagement(), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.orders).toEqual([]);
      expect(result.current.statusCounts.total).toBe(0);
    });

    it("sem login não consulta", () => {
      useAuthStore.setState({ ...initialAuthState, isAuthenticated: false }, true);

      renderHook(() => useOrderManagement(), { wrapper });

      expect(orders.getCompanyOrders).not.toHaveBeenCalled();
    });
  });

  describe("alarme de pedido novo", () => {
    it("não dispara loop contínuo de 2,8s (alerta global cuida do som LDMF-329)", async () => {
      const { result } = await renderLoaded();

      await serverNow(result, [order("n1", "ORDERED")]);

      expect(sound.loop).not.toHaveBeenCalled();
    });

    it("Novos esvaziado desliga o alarme", async () => {
      const { result } = await renderLoaded();
      await serverNow(result, [order("n1", "ORDERED")]);
      sound.stopLoop.mockClear();

      await serverNow(result, [order("n1", "IN_PRODUCTION")]);

      expect(sound.stopLoop).toHaveBeenCalledWith("new-order");
    });

    it("desmontar a tela desliga o alarme", async () => {
      const { unmount } = await renderLoaded();
      sound.stopLoop.mockClear();

      unmount();

      expect(sound.stopLoop).toHaveBeenCalledWith("new-order");
    });
  });

  describe("avançar status", () => {
    it("avançar o único pedido novo cala o alarme e chama a API", async () => {
      server = [order("n1", "ORDERED")];
      orders.updateOrderStatus.mockResolvedValue({ success: true });
      const { result } = await renderLoaded();
      sound.stopLoop.mockClear();

      act(() => result.current.advanceOrder("n1", "IN_PRODUCTION"));

      expect(sound.stopLoop).toHaveBeenCalledWith("new-order");
      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Status atualizado com sucesso"));
      expect(orders.updateOrderStatus).toHaveBeenCalledWith("n1", "IN_PRODUCTION");
      expect(sound.play).toHaveBeenCalledWith("success");
    });

    it("com outro pedido ainda em Novos, o alarme continua", async () => {
      server = [order("n1", "ORDERED"), order("n2", "ORDERED")];
      orders.updateOrderStatus.mockResolvedValue({ success: true });
      const { result } = await renderLoaded();
      sound.stopLoop.mockClear();

      act(() => result.current.advanceOrder("n1", "IN_PRODUCTION"));

      expect(sound.stopLoop).not.toHaveBeenCalled();
    });

    it("avançar fecha o diálogo de ação", async () => {
      server = [order("p1", "IN_PRODUCTION")];
      orders.updateOrderStatus.mockResolvedValue({ success: true });
      const { result } = await renderLoaded();

      act(() => result.current.setActionTarget(server[0]));
      act(() => result.current.advanceOrder("p1", "READY_FOR_PICKUP"));

      expect(result.current.actionTarget).toBeNull();
    });

    it("sucesso atualiza a lista", async () => {
      orders.updateOrderStatus.mockResolvedValue({ success: true });
      const { result } = await renderLoaded();
      const before = orders.getCompanyOrders.mock.calls.length;

      act(() => result.current.advanceOrder("p1", "READY_FOR_PICKUP"));

      await waitFor(() =>
        expect(orders.getCompanyOrders.mock.calls.length).toBeGreaterThan(before),
      );
    });

    it("recusa do backend mostra a mensagem e não toca sucesso", async () => {
      orders.updateOrderStatus.mockResolvedValue({ success: false, message: "Transição inválida" });
      const { result } = await renderLoaded();

      act(() => result.current.advanceOrder("p1", "COMPLETED"));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Transição inválida"));
      expect(sound.play).not.toHaveBeenCalled();
    });

    it("exceção de rede avisa erro de conexão", async () => {
      orders.updateOrderStatus.mockRejectedValue(new Error("offline"));
      const { result } = await renderLoaded();

      act(() => result.current.advanceOrder("p1", "COMPLETED"));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Erro de conexão ao atualizar status"),
      );
    });
  });

  describe("cancelar", () => {
    it("sucesso fecha o diálogo, toca o som e avisa", async () => {
      server = [order("n1", "ORDERED")];
      orders.cancelOrder.mockResolvedValue({ success: true });
      const { result } = await renderLoaded();
      act(() => result.current.setCancelTarget(server[0]));

      act(() => result.current.cancelOrder("n1", "Cliente desistiu"));

      await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Pedido cancelado"));
      expect(orders.cancelOrder).toHaveBeenCalledWith("n1", "Cliente desistiu");
      expect(sound.play).toHaveBeenCalledWith("error");
      expect(result.current.cancelTarget).toBeNull();
    });

    it("recusa mantém o diálogo aberto para tentar de novo", async () => {
      server = [order("n1", "ORDERED")];
      orders.cancelOrder.mockResolvedValue({ success: false });
      const { result } = await renderLoaded();
      act(() => result.current.setCancelTarget(server[0]));

      act(() => result.current.cancelOrder("n1", "Cliente desistiu"));

      await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Erro ao cancelar pedido"));
      expect(result.current.cancelTarget).toEqual(server[0]);
    });

    it("exceção de rede avisa erro de conexão", async () => {
      orders.cancelOrder.mockRejectedValue(new Error("offline"));
      const { result } = await renderLoaded();

      act(() => result.current.cancelOrder("n1", "motivo"));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Erro de conexão ao cancelar pedido"),
      );
    });

    it("isCanceling acompanha a requisição", async () => {
      orders.cancelOrder.mockReturnValue(new Promise(() => {}));
      const { result } = await renderLoaded();

      act(() => result.current.cancelOrder("n1", "motivo"));

      await waitFor(() => expect(result.current.isCanceling).toBe(true));
      expect(result.current.isUpdating).toBe(false);
    });
  });

  it("toggleSound usa o mute persistido do gerenciador de som", async () => {
    const { result } = await renderLoaded();

    act(() => result.current.toggleSound());

    expect(sound.toggleMuted).toHaveBeenCalled();
  });
});
