import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiService, type Address, type Order } from "@/services/api";
import { useAuthStore } from "@/stores/auth-store";
import { useOrderStatus } from "./use-order-status";

const { nav, playMock } = vi.hoisted(() => {
  const router = { push: vi.fn() };
  return {
    // Referências estáveis: identidade nova a cada chamada causa laço de render.
    nav: { params: new URLSearchParams("orderId=o1"), router },
    playMock: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.params,
  useRouter: () => nav.router,
}));

vi.mock("@/hooks/use-sound", () => ({
  useSound: () => ({ play: playMock }),
}));

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    apiService: {
      orders: { viewOrder: vi.fn(), getCustomerOrder: vi.fn() },
      orderItems: { listByOrder: vi.fn() },
      deliveries: { getCustomerDeliveries: vi.fn() },
      address: { getUserAddresses: vi.fn() },
    },
  };
});

const api = vi.mocked(apiService, true);

const address: Address = {
  id: "addr-1",
  street: "Rua das Flores",
  number: "10",
  complement: "Apto 3",
  neighborhood: "Centro",
  city: "Curitiba",
  state: "PR",
  zipCode: "80000-000",
} as Address;

// Estado do backend que cada teste ajusta.
let orderStatus = "ORDERED";
let deliveryRow: Record<string, unknown> | null = null;

const initialAuthState = useAuthStore.getState();
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function renderLoaded() {
  const hook = renderHook(() => useOrderStatus(), { wrapper });
  await waitFor(() => expect(hook.result.current.order).not.toBeNull());
  return hook;
}

async function refetchWith(
  result: { current: ReturnType<typeof useOrderStatus> },
  status: string,
  delivery: Record<string, unknown> | null = deliveryRow,
) {
  orderStatus = status;
  deliveryRow = delivery;
  await act(async () => {
    await result.current.refresh();
  });
}

describe("useOrderStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    nav.params = new URLSearchParams("orderId=o1");
    orderStatus = "ORDERED";
    deliveryRow = null;
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    useAuthStore.setState(
      {
        ...initialAuthState,
        isAuthenticated: true,
        user: {
          id: "user-1",
          name: "Ana",
          email: "ana@example.com",
          cpf: "",
          phone: "41999990000",
          birthDate: "",
          role: "client",
        },
      },
      true,
    );

    api.orders.viewOrder.mockImplementation(async () => ({
      success: true,
      data: { id: "o1", orderNumber: 42, status: orderStatus, totalValue: 57.5 } as unknown as Order,
    }));
    // Itens do pedido: cliente lê de GET /order/customer/me/:id (LDMF-317)
    api.orders.getCustomerOrder.mockResolvedValue({
      success: true,
      data: {
        id: "o1",
        orderedItems: [
          { quantity: 2, unitPrice: 20, product: { name: "Pizza", salePrice: 25 } },
          { quantity: 0, product: { salePrice: 9 } },
        ],
      } as never,
    });
    // GET /order-item/order/:id com carrinho aberto devolve o carrinho, não
    // o pedido (medido em 16/10, LDMF-356)
    api.orderItems.listByOrder.mockResolvedValue({
      success: true,
      data: [{ quantity: 1, unitPrice: 10, product: { name: "Burger do carrinho" } }] as never,
    });
    api.deliveries.getCustomerDeliveries.mockImplementation(async () => ({
      success: true,
      data: deliveryRow ? [{ orderId: "outro" }, { orderId: "o1", ...deliveryRow }] : [],
    }) as never);
    api.address.getUserAddresses.mockResolvedValue({ success: true, data: [address] });
  });

  afterEach(() => {
    queryClient.clear();
    vi.useRealTimers();
  });

  describe("pré-condições", () => {
    it("sem orderId na URL, avisa e não consulta", () => {
      nav.params = new URLSearchParams("");

      const { result } = renderHook(() => useOrderStatus(), { wrapper });

      expect(result.current.error).toBe("OrderId não encontrado na URL");
      expect(api.orders.viewOrder).not.toHaveBeenCalled();
    });

    it("sem usuário logado, avisa e não consulta", () => {
      useAuthStore.setState({ ...initialAuthState, user: null }, true);

      const { result } = renderHook(() => useOrderStatus(), { wrapper });

      expect(result.current.error).toBe("Usuário não autenticado");
      expect(api.orders.viewOrder).not.toHaveBeenCalled();
    });
  });

  describe("montagem do pedido", () => {
    it("consulta pedido, itens e entregas do cliente com os ids certos", async () => {
      await renderLoaded();

      expect(api.orders.viewOrder).toHaveBeenCalledWith("user-1", "o1");
      expect(api.orders.getCustomerOrder).toHaveBeenCalledWith("o1");
      expect(api.deliveries.getCustomerDeliveries).toHaveBeenCalled();
    });

    it("monta número, total, itens e dados do cliente", async () => {
      const { result } = await renderLoaded();

      expect(result.current.order).toMatchObject({
        id: "o1",
        orderNumber: "42",
        status: "confirmed",
        rawStatus: "ORDERED",
        isCanceled: false,
        total: 57.5,
        estimatedTime: "30-40 min",
        customerInfo: {
          name: "Ana",
          phone: "41999990000",
          address: "Endereço não disponível",
        },
      });
      // Preço do item cai para o salePrice e quantidade 0 vira 1.
      expect(result.current.order!.items).toEqual([
        { name: "Pizza", quantity: 2, price: 20 },
        { name: "Item", quantity: 1, price: 9 },
      ]);
      expect(result.current.error).toBeNull();
    });

    it("cliente com carrinho aberto de outra loja vê os itens do pedido, não os do carrinho (LDMF-317)", async () => {
      api.orders.getCustomerOrder.mockResolvedValue({
        success: true,
        data: {
          id: "o1",
          orderedItems: [
            { quantity: 1, unitPrice: 10, product: { name: "Sorvete B1" } },
            { quantity: 1, unitPrice: 10, product: { name: "Sorvete B2" } },
          ],
        } as never,
      });

      const { result } = await renderLoaded();

      expect(result.current.order!.items.map((item) => item.name)).toEqual([
        "Sorvete B1",
        "Sorvete B2",
      ]);
      expect(api.orderItems.listByOrder).not.toHaveBeenCalled();
    });

    it("quem não é cliente (dono que comprou) segue na rota antiga até o LDMF-356", async () => {
      // GET /order/customer/me/:id responde 403 para quem não é cliente
      useAuthStore.setState({
        user: { ...useAuthStore.getState().user!, role: "owner" },
      });

      const { result } = await renderLoaded();

      expect(api.orderItems.listByOrder).toHaveBeenCalledWith("o1", "user-1");
      expect(api.orders.getCustomerOrder).not.toHaveBeenCalled();
      expect(result.current.order!.items.map((item) => item.name)).toEqual([
        "Burger do carrinho",
      ]);
    });

    it("erro no pedido vira a mensagem do backend", async () => {
      api.orders.viewOrder.mockResolvedValue({ success: false, message: "Pedido não é seu" });

      const { result } = renderHook(() => useOrderStatus(), { wrapper });

      await waitFor(() => expect(result.current.error).toBe("Pedido não é seu"));
      expect(result.current.order).toBeNull();
    });

    it("falha nas entregas não derruba a tela: segue sem entrega", async () => {
      api.deliveries.getCustomerDeliveries.mockRejectedValue(new Error("offline"));

      const { result } = await renderLoaded();

      expect(result.current.order!.delivery).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it("usa a entrega do próprio pedido, e o prazo dela quando vier", async () => {
      deliveryRow = { status: "PENDING", estimatedDeliveryTime: "20-25 min" };

      const { result } = await renderLoaded();

      expect(result.current.order!.delivery).toMatchObject({ orderId: "o1", status: "PENDING" });
      expect(result.current.order!.estimatedTime).toBe("20-25 min");
    });

    it("pedido pronto com entrega coletada aparece como a caminho", async () => {
      orderStatus = "READY_FOR_PICKUP";
      deliveryRow = { status: "PICKED_UP" };

      const { result } = await renderLoaded();

      expect(result.current.order!.status).toBe("delivering");
    });
  });

  describe("endereço da entrega", () => {
    it("com o endereço aninhado, formata sem nova requisição", async () => {
      deliveryRow = { deliveryAddressId: "addr-1", deliveryAddress: address };

      const { result } = await renderLoaded();

      expect(result.current.order!.customerInfo.address).toBe(
        "Rua das Flores, 10, Apto 3 - Centro, Curitiba/PR - CEP: 80000-000",
      );
      expect(api.address.getUserAddresses).not.toHaveBeenCalled();
    });

    it("só com o id, busca nos endereços do cliente", async () => {
      deliveryRow = { deliveryAddressId: "addr-1" };
      api.address.getUserAddresses.mockResolvedValue({
        success: true,
        data: [{ ...address, complement: undefined }],
      });

      const { result } = await renderLoaded();

      expect(result.current.order!.customerInfo.address).toBe(
        "Rua das Flores, 10 - Centro, Curitiba/PR - CEP: 80000-000",
      );
    });

    it("id que não está entre os endereços do cliente mostra o texto padrão", async () => {
      deliveryRow = { deliveryAddressId: "addr-apagado" };

      const { result } = await renderLoaded();

      expect(result.current.order!.customerInfo.address).toBe("Endereço não disponível");
    });

    it("falha ao buscar endereços não derruba a tela", async () => {
      deliveryRow = { deliveryAddressId: "addr-1" };
      api.address.getUserAddresses.mockRejectedValue(new Error("offline"));

      const { result } = await renderLoaded();

      expect(result.current.order!.customerInfo.address).toBe("Endereço não disponível");
      expect(result.current.error).toBeNull();
    });

    it("endereço em texto é usado como veio", async () => {
      deliveryRow = { deliveryAddress: "Av. Brasil, 500" };

      const { result } = await renderLoaded();

      expect(result.current.order!.customerInfo.address).toBe("Av. Brasil, 500");
    });
  });

  describe("sons de avanço", () => {
    it("a primeira carga não toca nada", async () => {
      orderStatus = "IN_PRODUCTION";

      await renderLoaded();

      expect(playMock).not.toHaveBeenCalled();
    });

    it("cada avanço toca o som da etapa nova", async () => {
      const { result } = await renderLoaded();

      await refetchWith(result, "IN_PRODUCTION");
      await waitFor(() => expect(playMock).toHaveBeenLastCalledWith("step-preparing"));

      await refetchWith(result, "READY_FOR_PICKUP");
      await waitFor(() => expect(playMock).toHaveBeenLastCalledWith("step-ready"));

      await refetchWith(result, "READY_FOR_PICKUP", { status: "PICKED_UP" });
      await waitFor(() => expect(playMock).toHaveBeenLastCalledWith("step-on-the-way"));

      await refetchWith(result, "READY_FOR_PICKUP", { status: "DELIVERED" });
      await waitFor(() => expect(playMock).toHaveBeenLastCalledWith("order-arrived"));
      expect(playMock).toHaveBeenCalledTimes(4);
    });

    it("refetch sem mudança de etapa não repete o som", async () => {
      const { result } = await renderLoaded();

      await refetchWith(result, "IN_PRODUCTION");
      await refetchWith(result, "IN_PRODUCTION");

      await waitFor(() => expect(playMock).toHaveBeenCalledTimes(1));
    });

    it("cancelamento toca o som de erro uma vez só", async () => {
      const { result } = await renderLoaded();

      await refetchWith(result, "CANCELED");
      await waitFor(() => expect(playMock).toHaveBeenCalledWith("error"));
      await refetchWith(result, "CANCELED");

      expect(playMock).toHaveBeenCalledTimes(1);
    });

    it("cancelado continua sem repetir o erro quando a entrega muda depois", async () => {
      const { result } = await renderLoaded();

      await refetchWith(result, "CANCELED");
      await waitFor(() => expect(playMock).toHaveBeenCalledWith("error"));
      // Etapa exibida muda (a entrega fechou), mas o pedido segue cancelado.
      await refetchWith(result, "CANCELED", { status: "DELIVERED" });
      await waitFor(() => expect(result.current.order!.status).toBe("delivered"));

      expect(playMock).toHaveBeenCalledTimes(1);
    });

    it("abrir a tela com o pedido já cancelado não toca o erro", async () => {
      orderStatus = "CANCELED";
      const { result } = await renderLoaded();

      await refetchWith(result, "CANCELED");

      expect(result.current.order!.isCanceled).toBe(true);
      expect(playMock).not.toHaveBeenCalled();
    });
  });

  describe("atualização automática", () => {
    it("pedido ativo refaz a consulta a cada 30s", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      await renderLoaded();
      const calls = api.orders.viewOrder.mock.calls.length;

      await act(async () => {
        vi.advanceTimersByTime(30_000);
      });

      await waitFor(() => expect(api.orders.viewOrder.mock.calls.length).toBe(calls + 1));
    });

    it("pedido entregue para de consultar", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      orderStatus = "COMPLETED";
      const { result } = await renderLoaded();
      expect(result.current.order!.status).toBe("delivered");
      const calls = api.orders.viewOrder.mock.calls.length;

      await act(async () => {
        vi.advanceTimersByTime(90_000);
      });

      expect(api.orders.viewOrder.mock.calls.length).toBe(calls);
    });

    it("pedido cancelado para de consultar", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      orderStatus = "CANCELED";
      await renderLoaded();
      const calls = api.orders.viewOrder.mock.calls.length;

      await act(async () => {
        vi.advanceTimersByTime(90_000);
      });

      expect(api.orders.viewOrder.mock.calls.length).toBe(calls);
    });

    it("a contagem regressiva desce a cada segundo", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const { result } = await renderLoaded();
      expect(result.current.secondsUntilRefresh).toBe(30);

      await act(async () => {
        vi.advanceTimersByTime(5_000);
      });

      expect(result.current.secondsUntilRefresh).toBeLessThanOrEqual(25);
      expect(result.current.secondsUntilRefresh).toBeGreaterThan(20);
    });
  });

  it("getStatusMessage tem texto para cada etapa", async () => {
    const { result } = renderHook(() => useOrderStatus(), { wrapper });

    expect(result.current.getStatusMessage("delivering")).toBe(
      "Pedido a caminho! Chegando em breve.",
    );
    expect(result.current.getStatusMessage("confirmed")).toMatch(/confirmado/);
  });
});
