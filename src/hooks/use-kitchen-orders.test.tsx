import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { io } from "socket.io-client";
import type {
  KitchenOrder,
  KitchenOrdersPage,
  KitchenStatus,
} from "@/components/kitchen/types";
import { socketAuthProvider } from "@/lib/socket-auth";
import {
  advanceKitchenOrderStatus,
  cancelKitchenOrder,
  fetchKitchenOrdersByStatus,
  KitchenApiError,
} from "@/services/kitchen";
import { useAuthStore, usePreferencesStore } from "@/stores";
import { useKitchenOrders } from "./use-kitchen-orders";

// A URL do socket é lida quando o módulo carrega: precisa existir antes do import.
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_API_URL = "http://api.test";
});

const { playMock, unlockMock, fakeSocket } = vi.hoisted(() => {
  type Handler = (...args: unknown[]) => void;
  const handlers = new Map<string, Handler>();
  return {
    playMock: vi.fn(),
    unlockMock: vi.fn(),
    fakeSocket: {
      handlers,
      on: vi.fn((event: string, handler: Handler) => {
        handlers.set(event, handler);
      }),
      emit: vi.fn(),
      disconnect: vi.fn(),
      // Dispara um evento como se viesse do servidor.
      fire(event: string, ...args: unknown[]) {
        handlers.get(event)?.(...args);
      },
    },
  };
});

vi.mock("socket.io-client", () => ({ io: vi.fn(() => fakeSocket) }));

vi.mock("@/hooks/use-sound", () => ({
  useSound: () => ({ play: playMock, unlock: unlockMock }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/kitchen", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/kitchen")>();
  return {
    ...actual,
    fetchKitchenOrdersByStatus: vi.fn(),
    advanceKitchenOrderStatus: vi.fn(),
    cancelKitchenOrder: vi.fn(),
  };
});

const order = (id: string, status: KitchenStatus): KitchenOrder => ({
  id,
  status,
  created_at: "2026-09-29T12:00:00.000Z",
  statusChangedAt: "2026-09-29T12:00:00.000Z",
  fulfillmentType: "DELIVERY",
});

// Fonte das páginas por coluna. Cada teste monta o quadro que precisa.
let board: Partial<Record<KitchenStatus, KitchenOrder[][]>> = {};

function pageOf(status: KitchenStatus, page: number): KitchenOrdersPage {
  const pages = board[status] ?? [[]];
  const data = pages[page - 1] ?? [];
  return {
    data,
    meta: {
      page,
      limit: 20,
      total: pages.reduce((sum, p) => sum + p.length, 0),
      totalPages: pages.length,
    },
  };
}

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const ids = (orders: KitchenOrder[]) => orders.map((o) => o.id);

const initialAuthState = useAuthStore.getState();
const initialPreferencesState = usePreferencesStore.getState();

let queryClient: QueryClient;

function renderKitchen() {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useKitchenOrders(), { wrapper });
}

async function renderLoaded() {
  const hook = renderKitchen();
  await waitFor(() => {
    expect(hook.result.current.columns.ORDERED.isLoading).toBe(false);
    expect(hook.result.current.columns.IN_PRODUCTION.isLoading).toBe(false);
    expect(hook.result.current.columns.READY_FOR_PICKUP.isLoading).toBe(false);
    expect(hook.result.current.columns.COMPLETED.isLoading).toBe(false);
  });
  return hook;
}

describe("useKitchenOrders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fakeSocket.handlers.clear();
    board = {};
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    useAuthStore.setState({ ...initialAuthState, isAuthenticated: true }, true);
    usePreferencesStore.setState(initialPreferencesState, true);
    vi.mocked(fetchKitchenOrdersByStatus).mockImplementation(async (status, { page }) => {
      // Responde numa volta do event loop, como a rede. Resposta síncrona
      // funde "buscando" e "pronto" no mesmo render e a paginação automática
      // não enxerga a troca de estado (ver o relatório da cozinha).
      await new Promise((resolve) => setTimeout(resolve, 0));
      return pageOf(status, page);
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe("carga das colunas", () => {
    it("preenche as colunas de trabalho e não consulta Cancelados enquanto oculto", async () => {
      board = {
        ORDERED: [[order("o1", "ORDERED")]],
        IN_PRODUCTION: [[order("p1", "IN_PRODUCTION"), order("p2", "IN_PRODUCTION")]],
        READY_FOR_PICKUP: [[order("r1", "READY_FOR_PICKUP")]],
        COMPLETED: [[order("c1", "COMPLETED")]],
      };

      const { result } = await renderLoaded();

      expect(ids(result.current.columns.ORDERED.orders)).toEqual(["o1"]);
      expect(ids(result.current.columns.IN_PRODUCTION.orders)).toEqual(["p1", "p2"]);
      expect(result.current.activeOrderTotal).toBe(4);
      expect(result.current.isEmptyBoard).toBe(false);
      expect(result.current.columnOrder.map((c) => c.status)).not.toContain("CANCELED");
      const statuses = vi.mocked(fetchKitchenOrdersByStatus).mock.calls.map(([s]) => s);
      expect(statuses).not.toContain("CANCELED");
    });

    it("o contador vem de meta.total, não do que está na tela", async () => {
      vi.mocked(fetchKitchenOrdersByStatus).mockImplementation(async (status, { page }) =>
        status === "COMPLETED"
          ? {
              data: [order("c1", "COMPLETED")],
              meta: { page, limit: 20, total: 57, totalPages: 3 },
            }
          : pageOf(status, page),
      );

      const { result } = await renderLoaded();

      expect(result.current.columns.COMPLETED.orders).toHaveLength(1);
      expect(result.current.columns.COMPLETED.total).toBe(57);
      expect(result.current.columns.COMPLETED.hasMore).toBe(true);
    });

    it("Novos puxa sozinho as páginas seguintes até acabar", async () => {
      board = {
        ORDERED: [[order("o1", "ORDERED")], [order("o2", "ORDERED")], [order("o3", "ORDERED")]],
      };

      const { result } = await renderLoaded();

      await waitFor(() => {
        expect(ids(result.current.columns.ORDERED.orders)).toEqual(["o1", "o2", "o3"]);
      });
      expect(result.current.columns.ORDERED.hasMore).toBe(false);
    });

    it("Concluídos só avança de página no loadMore", async () => {
      board = { COMPLETED: [[order("c1", "COMPLETED")], [order("c2", "COMPLETED")]] };

      const { result } = await renderLoaded();

      expect(ids(result.current.columns.COMPLETED.orders)).toEqual(["c1"]);
      expect(result.current.columns.COMPLETED.hasMore).toBe(true);

      act(() => result.current.columns.COMPLETED.loadMore());

      await waitFor(() => {
        expect(ids(result.current.columns.COMPLETED.orders)).toEqual(["c1", "c2"]);
      });
    });

    it("só Concluídos leva o período; Novos vai sem corte de data", async () => {
      await renderLoaded();

      const calls = vi.mocked(fetchKitchenOrdersByStatus).mock.calls;
      const orderedParams = calls.find(([s]) => s === "ORDERED")![1];
      const completedParams = calls.find(([s]) => s === "COMPLETED")![1];

      expect(orderedParams.startDate).toBeUndefined();
      expect(orderedParams.endDate).toBeUndefined();
      expect(completedParams.startDate).toEqual(expect.any(String));
      expect(completedParams.endDate).toEqual(expect.any(String));
    });

    it("quadro sem pedidos nas colunas de trabalho é quadro vazio", async () => {
      const { result } = await renderLoaded();

      expect(result.current.isEmptyBoard).toBe(true);
      expect(result.current.activeOrderTotal).toBe(0);
    });

    it("sem login não consulta nada nem abre socket", () => {
      useAuthStore.setState({ ...initialAuthState, isAuthenticated: false }, true);

      renderKitchen();

      expect(fetchKitchenOrdersByStatus).not.toHaveBeenCalled();
      expect(io).not.toHaveBeenCalled();
    });
  });

  describe("Cancelados", () => {
    it("ligar Cancelados consulta a coluna e a mostra no quadro", async () => {
      board = { CANCELED: [[order("x1", "CANCELED")]] };
      const { result } = await renderLoaded();

      act(() => result.current.toggleCanceled());

      await waitFor(() => {
        expect(ids(result.current.columns.CANCELED.orders)).toEqual(["x1"]);
      });
      expect(result.current.columnOrder.map((c) => c.status)).toContain("CANCELED");
    });

    it("desligar Cancelados com a aba ativa nela volta para Novos", async () => {
      const { result } = await renderLoaded();

      act(() => result.current.toggleCanceled());
      act(() => result.current.setActiveStatus("CANCELED"));
      act(() => result.current.toggleCanceled());

      expect(result.current.activeStatus).toBe("ORDERED");
    });

    it("desligar Cancelados com outra aba ativa mantém a aba", async () => {
      const { result } = await renderLoaded();

      act(() => result.current.toggleCanceled());
      act(() => result.current.setActiveStatus("READY_FOR_PICKUP"));
      act(() => result.current.toggleCanceled());

      expect(result.current.activeStatus).toBe("READY_FOR_PICKUP");
    });
  });

  describe("avançar status", () => {
    it("move o card para a próxima coluna antes da resposta e chama a API", async () => {
      board = { ORDERED: [[order("o1", "ORDERED"), order("o2", "ORDERED")]] };
      const pending = deferred();
      vi.mocked(advanceKitchenOrderStatus).mockReturnValue(pending.promise);
      const { result } = await renderLoaded();

      act(() => result.current.advanceOrder(result.current.columns.ORDERED.orders[0]));

      await waitFor(() => {
        expect(ids(result.current.columns.IN_PRODUCTION.orders)).toEqual(["o1"]);
      });
      expect(ids(result.current.columns.ORDERED.orders)).toEqual(["o2"]);
      expect(result.current.columns.ORDERED.total).toBe(1);
      expect(result.current.columns.IN_PRODUCTION.orders[0].status).toBe("IN_PRODUCTION");
      expect(result.current.advancingOrderId).toBe("o1");
      expect(advanceKitchenOrderStatus).toHaveBeenCalledWith("o1", "IN_PRODUCTION");

      board = { ORDERED: [[order("o2", "ORDERED")]], IN_PRODUCTION: [[order("o1", "IN_PRODUCTION")]] };
      await act(async () => pending.resolve());

      await waitFor(() => expect(result.current.advancingOrderId).toBeUndefined());
      expect(ids(result.current.columns.IN_PRODUCTION.orders)).toEqual(["o1"]);
    });

    it("se a API recusar, devolve o card e mostra o erro traduzido", async () => {
      board = { ORDERED: [[order("o1", "ORDERED")]] };
      const pending = deferred();
      vi.mocked(advanceKitchenOrderStatus).mockReturnValue(pending.promise);
      const { result } = await renderLoaded();

      act(() => result.current.advanceOrder(result.current.columns.ORDERED.orders[0]));
      await waitFor(() => {
        expect(ids(result.current.columns.IN_PRODUCTION.orders)).toEqual(["o1"]);
      });

      // Refetch pós-erro fica pendurado: o card precisa voltar pelo rollback,
      // não porque o backend devolveu o quadro de novo.
      vi.mocked(fetchKitchenOrdersByStatus).mockReturnValue(new Promise(() => {}));
      await act(async () => pending.reject(new KitchenApiError("forbidden", 403)));

      await waitFor(() => {
        expect(ids(result.current.columns.ORDERED.orders)).toEqual(["o1"]);
      });
      expect(result.current.columns.IN_PRODUCTION.orders).toEqual([]);
      expect(toast.error).toHaveBeenCalledWith("Este pedido é de outra empresa.");
    });

    it("pedido concluído não tem próximo status: não chama a API", async () => {
      board = { COMPLETED: [[order("c1", "COMPLETED")]] };
      const { result } = await renderLoaded();

      act(() => result.current.advanceOrder(result.current.columns.COMPLETED.orders[0]));

      expect(advanceKitchenOrderStatus).not.toHaveBeenCalled();
    });
  });

  describe("cancelar", () => {
    it("tira o card da coluna, chama a API com o motivo e avisa o sucesso", async () => {
      board = { IN_PRODUCTION: [[order("p1", "IN_PRODUCTION")]] };
      const pending = deferred();
      vi.mocked(cancelKitchenOrder).mockReturnValue(pending.promise);
      const { result } = await renderLoaded();

      let done!: Promise<void>;
      act(() => {
        done = result.current.cancelOrder(result.current.columns.IN_PRODUCTION.orders[0], "sem estoque");
      });

      await waitFor(() => expect(result.current.columns.IN_PRODUCTION.orders).toEqual([]));
      expect(result.current.isCanceling).toBe(true);
      expect(cancelKitchenOrder).toHaveBeenCalledWith("p1", "sem estoque");

      board = {};
      await act(async () => {
        pending.resolve();
        await done;
      });

      expect(toast.success).toHaveBeenCalledWith("Pedido cancelado");
    });

    it("com Cancelados visível, o card cancelado aparece lá na hora", async () => {
      board = { ORDERED: [[order("o1", "ORDERED")]], CANCELED: [[order("x0", "CANCELED")]] };
      vi.mocked(cancelKitchenOrder).mockReturnValue(new Promise(() => {}));
      const { result } = await renderLoaded();
      act(() => result.current.toggleCanceled());
      await waitFor(() => expect(result.current.columns.CANCELED.isLoading).toBe(false));

      act(() => {
        void result.current.cancelOrder(result.current.columns.ORDERED.orders[0], "cliente desistiu");
      });

      await waitFor(() => {
        expect(ids(result.current.columns.CANCELED.orders)).toEqual(["o1", "x0"]);
      });
      expect(result.current.columns.CANCELED.orders[0].status).toBe("CANCELED");
    });

    it("se a API recusar, devolve o card e mostra o erro traduzido", async () => {
      board = { ORDERED: [[order("o1", "ORDERED")]] };
      const pending = deferred();
      vi.mocked(cancelKitchenOrder).mockReturnValue(pending.promise);
      const { result } = await renderLoaded();

      let done!: Promise<void>;
      act(() => {
        done = result.current.cancelOrder(result.current.columns.ORDERED.orders[0], " ");
      });
      await waitFor(() => expect(result.current.columns.ORDERED.orders).toEqual([]));

      // Refetch pós-erro fica pendurado: o card volta só pelo rollback.
      vi.mocked(fetchKitchenOrdersByStatus).mockReturnValue(new Promise(() => {}));
      await act(async () => {
        pending.reject(new KitchenApiError("Motivo do cancelamento é obrigatório", 400));
        await done.catch(() => {});
      });

      await waitFor(() => {
        expect(ids(result.current.columns.ORDERED.orders)).toEqual(["o1"]);
      });
      expect(toast.error).toHaveBeenCalledWith("Informe o motivo do cancelamento.");
      expect(toast.success).not.toHaveBeenCalled();
    });
  });

  describe("tempo real", () => {
    it("conecta no namespace /orders com auth dinâmico e entra na sala da empresa", async () => {
      const { result } = await renderLoaded();

      expect(io).toHaveBeenCalledWith("http://api.test/orders", { auth: socketAuthProvider });
      expect(result.current.isLive).toBe(false);

      act(() => fakeSocket.fire("connect"));

      expect(result.current.isLive).toBe(true);
      expect(fakeSocket.emit).toHaveBeenCalledWith(
        "joinCompanyOrders",
        undefined,
        expect.any(Function),
      );
    });

    it("avisa quando o servidor não confirma a entrada na sala", async () => {
      await renderLoaded();
      act(() => fakeSocket.fire("connect"));

      const ack = fakeSocket.emit.mock.calls[0][2] as (ack?: { ok?: boolean }) => void;
      act(() => ack({ ok: false }));

      expect(toast.error).toHaveBeenCalledWith(
        "Não foi possível acompanhar os pedidos em tempo real.",
      );
    });

    it("confirmação ok não gera aviso", async () => {
      await renderLoaded();
      act(() => fakeSocket.fire("connect"));

      const ack = fakeSocket.emit.mock.calls[0][2] as (ack?: { ok?: boolean }) => void;
      act(() => ack({ ok: true }));

      expect(toast.error).not.toHaveBeenCalled();
    });

    it("queda do socket desliga o modo ao vivo", async () => {
      const { result } = await renderLoaded();
      act(() => fakeSocket.fire("connect"));

      act(() => fakeSocket.fire("disconnect"));
      expect(result.current.isLive).toBe(false);

      act(() => fakeSocket.fire("connect"));
      act(() => fakeSocket.fire("connect_error"));
      expect(result.current.isLive).toBe(false);
    });

    it("orderStatusUpdated move o card para a coluna nova", async () => {
      board = { ORDERED: [[order("o1", "ORDERED")]] };
      const { result } = await renderLoaded();

      act(() => fakeSocket.fire("orderStatusUpdated", order("o1", "READY_FOR_PICKUP")));

      await waitFor(() => {
        expect(ids(result.current.columns.READY_FOR_PICKUP.orders)).toEqual(["o1"]);
      });
      expect(result.current.columns.ORDERED.orders).toEqual([]);
      expect(result.current.columns.READY_FOR_PICKUP.total).toBe(1);
    });

    it("orderCreated repetido não duplica o card", async () => {
      board = { ORDERED: [[order("o1", "ORDERED")]] };
      const { result } = await renderLoaded();

      act(() => fakeSocket.fire("orderCreated", order("o2", "ORDERED")));
      act(() => fakeSocket.fire("orderCreated", order("o2", "ORDERED")));

      await waitFor(() => {
        expect(ids(result.current.columns.ORDERED.orders)).toEqual(["o2", "o1"]);
      });
      expect(result.current.columns.ORDERED.total).toBe(2);
    });

    it("evento de conclusão não entra em Concluídos quando a data vista é outra", async () => {
      board = { READY_FOR_PICKUP: [[order("r1", "READY_FOR_PICKUP")]] };
      const { result } = await renderLoaded();

      act(() => {
        result.current.setPeriod("custom");
        result.current.setCustomDate(new Date(2020, 0, 15));
      });
      await waitFor(() => expect(result.current.columns.COMPLETED.isLoading).toBe(false));

      act(() => fakeSocket.fire("orderStatusUpdated", order("r1", "COMPLETED")));

      // Sai de Prontos (sempre ao vivo), mas não entra numa data passada.
      await waitFor(() => expect(result.current.columns.READY_FOR_PICKUP.orders).toEqual([]));
      expect(result.current.columns.COMPLETED.orders).toEqual([]);
    });

    it.each(["7d", "all"] as const)(
      "com o período '%s', pedido concluído em outro aparelho entra em Concluídos",
      async (period) => {
        board = { READY_FOR_PICKUP: [[order("r1", "READY_FOR_PICKUP")]] };
        const { result } = await renderLoaded();

        act(() => result.current.setPeriod(period));
        await waitFor(() => expect(result.current.columns.COMPLETED.isLoading).toBe(false));

        act(() => fakeSocket.fire("orderStatusUpdated", order("r1", "COMPLETED")));

        await waitFor(() => {
          expect(ids(result.current.columns.COMPLETED.orders)).toEqual(["r1"]);
        });
        expect(result.current.columns.READY_FOR_PICKUP.orders).toEqual([]);
      },
    );

    it("desmontar a tela desconecta o socket", async () => {
      const { unmount } = await renderLoaded();

      unmount();

      expect(fakeSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe("pedido novo", () => {
    it("a primeira carga não pisca nem apita", async () => {
      board = { ORDERED: [[order("o1", "ORDERED")]] };
      usePreferencesStore.setState({ kitchenSoundEnabled: true });

      const { result } = await renderLoaded();

      expect(result.current.highlightedIds).toEqual([]);
      expect(playMock).not.toHaveBeenCalled();
    });

    it("as páginas seguintes de Novos não piscam nem apitam (LDMF-452)", async () => {
      // Medido na loja de teste: 29 pedidos em Novos, e a página 2 (9 pedidos
      // antigos) tocava o som de pedido novo segundos depois de abrir a tela.
      board = {
        ORDERED: [[order("o1", "ORDERED")], [order("o2", "ORDERED")], [order("o3", "ORDERED")]],
      };
      usePreferencesStore.setState({ kitchenSoundEnabled: true });

      const { result } = await renderLoaded();
      await waitFor(() => {
        expect(ids(result.current.columns.ORDERED.orders)).toEqual(["o1", "o2", "o3"]);
      });

      expect(result.current.highlightedIds).toEqual([]);
      expect(playMock).not.toHaveBeenCalled();

      // E o pedido novo de verdade, depois das páginas, continua apitando.
      act(() => fakeSocket.fire("orderCreated", order("o9", "ORDERED")));
      await waitFor(() => expect(result.current.highlightedIds).toEqual(["o9"]));
      expect(playMock).toHaveBeenCalledWith("new-order");
    });

    it("pedido que chega depois pisca e toca o alerta quando o som está ligado", async () => {
      usePreferencesStore.setState({ kitchenSoundEnabled: true });
      const { result } = await renderLoaded();

      act(() => fakeSocket.fire("orderCreated", order("o9", "ORDERED")));

      await waitFor(() => expect(result.current.highlightedIds).toEqual(["o9"]));
      expect(playMock).toHaveBeenCalledWith("new-order");
    });

    it("com o som desligado, pisca mas não toca", async () => {
      usePreferencesStore.setState({ kitchenSoundEnabled: false });
      const { result } = await renderLoaded();

      act(() => fakeSocket.fire("orderCreated", order("o9", "ORDERED")));

      await waitFor(() => expect(result.current.highlightedIds).toEqual(["o9"]));
      expect(playMock).not.toHaveBeenCalled();
    });

    it("o destaque some depois de 12 segundos", async () => {
      const { result } = await renderLoaded();
      vi.useFakeTimers();
      try {
        act(() => fakeSocket.fire("orderCreated", order("o9", "ORDERED")));
        // O React Query avisa os observadores num setTimeout(0).
        act(() => vi.advanceTimersByTime(0));
        expect(result.current.highlightedIds).toEqual(["o9"]);

        act(() => vi.advanceTimersByTime(11_999));
        expect(result.current.highlightedIds).toEqual(["o9"]);

        act(() => vi.advanceTimersByTime(1));
        expect(result.current.highlightedIds).toEqual([]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("ligar o som destrava o áudio no gesto; desligar não", async () => {
      usePreferencesStore.setState({ kitchenSoundEnabled: false });
      const { result } = await renderLoaded();

      act(() => result.current.toggleSound());
      expect(unlockMock).toHaveBeenCalledTimes(1);
      expect(usePreferencesStore.getState().kitchenSoundEnabled).toBe(true);

      act(() => result.current.toggleSound());
      expect(unlockMock).toHaveBeenCalledTimes(1);
      expect(usePreferencesStore.getState().kitchenSoundEnabled).toBe(false);
    });
  });
});
