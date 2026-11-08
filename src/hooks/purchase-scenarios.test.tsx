import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/stores/auth-store";
import {
  getDeliveryDiscount,
  getPromoDiscount,
  isValidPromoCode,
  useCartStore,
  type CartItem,
} from "@/stores/cart-store";
import { useCartActions } from "./use-cart-actions";
import { useCheckoutProcess } from "./use-checkout-process";
import { apiService, type Order } from "@/services/api";

// Mocks hoisted
const {
  pushMock,
  confirmMock,
  playMock,
  toastError,
  toastSuccess,
  finishOrder,
  paymentsCreate,
  updateUserAddress,
  getUserAddresses,
  deleteUserAddress,
} = vi.hoisted(() => ({
  pushMock: vi.fn(),
  confirmMock: vi.fn().mockResolvedValue(true),
  playMock: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  finishOrder: vi.fn(),
  paymentsCreate: vi.fn(),
  updateUserAddress: vi.fn(),
  getUserAddresses: vi.fn(),
  deleteUserAddress: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, back: vi.fn() }),
}));

vi.mock("@/contexts/confirm-provider", () => ({
  useConfirm: () => ({ confirm: confirmMock }),
}));

vi.mock("@/hooks/use-sound", () => ({
  useSound: () => ({ play: playMock, unlock: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    apiService: {
      ...actual.apiService,
      orders: {
        openCart: vi.fn(),
        viewOrder: vi.fn(),
        clearCart: vi.fn(),
        finishOrder,
        getCustomerOrders: vi.fn().mockResolvedValue({ success: true, data: [] }),
      },
      orderItems: {
        addProductToCart: vi.fn(),
        removeProductFromCart: vi.fn(),
      },
      payments: { create: paymentsCreate },
      address: {
        getUserAddresses,
        updateUserAddress,
        deleteUserAddress,
        createUserAddress: vi.fn(),
      },
      productAddOns: { getAllPublic: vi.fn() },
      productVariations: { getAllPublic: vi.fn() },
    },
    PaymentMethod: {
      CASH: "CASH",
      CREDIT_CARD: "CREDIT_CARD",
      DEBIT_CARD: "DEBIT_CARD",
      PIX: "PIX",
      BANK_TRANSFER: "BANK_TRANSFER",
    },
  };
});

const RESTAURANT_1 = {
  id: "rest-1",
  name: "Pizzaria do Urso",
  deliveryFee: "10.00",
};

const RESTAURANT_2 = {
  id: "rest-2",
  name: "Hamburgueria Bear",
  deliveryFee: "8.00",
};

vi.mock("./use-restaurants", () => ({
  useRestaurant: (id: string | null) => ({
    data: id === "rest-2" ? RESTAURANT_2 : RESTAURANT_1,
  }),
}));

const MOCK_ADDRESSES = [
  {
    id: "addr-home",
    zipCode: "80000-000",
    street: "Rua das Flores",
    number: "123",
    neighborhood: "Centro",
    city: "Curitiba",
    state: "PR",
    isDefault: true,
  },
];

vi.mock("./use-addresses", () => ({
  useUserAddresses: () => ({
    data: MOCK_ADDRESSES,
    isLoading: false,
  }),
}));

vi.mock("@/lib/address-coordinates", () => ({
  resolveAddressCoordinates: vi.fn(),
  withCoords: vi.fn(),
}));

vi.mock("@/lib/geocode", () => ({ parseCoords: vi.fn() }));

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = "PurchaseTestWrapper";
  return Wrapper;
}

function loginUser(role = "client") {
  act(() => {
    useAuthStore.getState().login({
      id: "user-buyer-1",
      name: "Comprador Silva",
      email: "comprador@teste.com",
      cpf: "12345678901",
      phone: "41999998888",
      birthDate: "15/05/1990",
      role: role as any,
    });
  });
}

function logoutUser() {
  act(() => {
    useAuthStore.getState().logout();
  });
}

describe("Cenários de Compra (Jornada Completa do Cliente)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.setState({ user: null, isAuthenticated: false });
    useCartStore.setState({
      items: [],
      restaurant: null,
      isOpen: false,
      orderId: null,
      isLoading: false,
      lastSynced: null,
      appliedPromo: null,
    });

    finishOrder.mockReset();
    finishOrder.mockResolvedValue({ success: true, data: { id: "order-123" } });
    vi.mocked(apiService.orders.openCart).mockResolvedValue({
      success: true,
      data: { id: "cart-order-1" } as any,
    });
    vi.mocked(apiService.orderItems.addProductToCart).mockResolvedValue({
      success: true,
      data: {} as any,
    });
    paymentsCreate.mockReset();
    paymentsCreate.mockResolvedValue({ success: true, data: {} });
    updateUserAddress.mockReset();
    updateUserAddress.mockResolvedValue({ success: true, data: {} });
    getUserAddresses.mockReset();
    getUserAddresses.mockResolvedValue({ success: true, data: MOCK_ADDRESSES });
  });

  describe("1. Montagem do Carrinho e Customizações", () => {
    it("adiciona produto simples ao carrinho e calcula subtotal e total com entrega", () => {
      loginUser();
      const item: CartItem = {
        id: "line-1",
        productId: "prod-pizza",
        name: "Pizza Margherita",
        price: 45.0,
        quantity: 1,
        restaurantId: "rest-1",
        restaurantName: "Pizzaria do Urso",
      };

      act(() => {
        useCartStore.getState().setRestaurant({ id: "rest-1", name: "Pizzaria do Urso" });
        useCartStore.getState().setItems([item]);
      });

      const store = useCartStore.getState();
      expect(store.items).toHaveLength(1);
      expect(store.getSubtotal()).toBe(45.0);
      expect(store.getTotal(10.0)).toBe(55.0); // 45 + 10 frete
      expect(store.getTotalItems()).toBe(1);
    });

    it("adiciona item com variação e adicionais somando os valores corretamente", () => {
      loginUser();
      // Pizza Grande (R$ 50) + Borda Vulcão (R$ 10) + Bacon Extra (R$ 5) = R$ 65 por unidade
      const customizedItem: CartItem = {
        id: "line-custom-1",
        productId: "prod-pizza-custom",
        name: "Pizza Customizada",
        price: 65.0,
        quantity: 2,
        notes: "Sem cebola, bem assada",
        restaurantId: "rest-1",
        restaurantName: "Pizzaria do Urso",
      };

      act(() => {
        useCartStore.getState().setItems([customizedItem]);
      });

      const store = useCartStore.getState();
      expect(store.getSubtotal()).toBe(130.0); // 65 * 2
      expect(store.items[0].notes).toBe("Sem cebola, bem assada");
    });

    it("incrementa e decrementa quantidade até remoção do carrinho", () => {
      loginUser();
      const item: CartItem = {
        id: "line-item",
        productId: "prod-1",
        name: "Refrigerante",
        price: 8.0,
        quantity: 2,
        restaurantId: "rest-1",
        restaurantName: "Pizzaria do Urso",
      };

      act(() => {
        useCartStore.getState().setItems([item]);
      });
      expect(useCartStore.getState().getTotalItems()).toBe(2);

      // Decrementa para 1
      act(() => {
        useCartStore.getState().setItems([{ ...item, quantity: 1 }]);
      });
      expect(useCartStore.getState().getTotalItems()).toBe(1);
      expect(useCartStore.getState().getSubtotal()).toBe(8.0);

      // Remove item
      act(() => {
        useCartStore.getState().setItems([]);
      });
      expect(useCartStore.getState().items).toHaveLength(0);
      expect(useCartStore.getState().getSubtotal()).toBe(0);
    });

    it("bloqueia adicionar ao carrinho quando o usuário não está autenticado", async () => {
      logoutUser();
      const { result } = renderHook(() => useCartActions(), { wrapper: createWrapper() });

      await act(async () => {
        await result.current.handleAddToCart({
          product: { id: "p1", name: "Pizza", price: 30 } as any,
          restaurant: { id: "rest-1", name: "Pizzaria" } as any,
          quantity: 1,
        });
      });

      expect(toastError).toHaveBeenCalledWith("Você precisa estar logado para adicionar itens ao carrinho");
      expect(useCartStore.getState().items).toHaveLength(0);
    });

    it("alerta troca de restaurante quando já existem itens de outro restaurante", async () => {
      loginUser();
      act(() => {
        useCartStore.getState().setRestaurant({ id: "rest-1", name: "Pizzaria do Urso" });
        useCartStore.getState().setItems([{
          id: "item-r1",
          productId: "p1",
          name: "Pizza",
          price: 40,
          quantity: 1,
          restaurantId: "rest-1",
          restaurantName: "Pizzaria do Urso",
        }]);
      });

      // Usuário recusa limpar o carrinho
      confirmMock.mockResolvedValueOnce(false);
      const { result } = renderHook(() => useCartActions(), { wrapper: createWrapper() });

      let added: boolean | undefined;
      await act(async () => {
        added = await result.current.handleAddToCart({
          id: "p2",
          name: "Hambúrguer",
          price: 25,
          restaurantId: "rest-2",
          restaurantName: "Hamburgueria Bear",
        });
      });

      expect(confirmMock).toHaveBeenCalled();
      expect(added).toBe(false);
      // Carrinho original do Restaurante 1 mantido
      expect(useCartStore.getState().restaurant?.id).toBe("rest-1");
      expect(useCartStore.getState().items).toHaveLength(1);

      // Agora usuário aceita limpar o carrinho
      confirmMock.mockResolvedValueOnce(true);
      vi.mocked(apiService.orders.clearCart).mockResolvedValue({ success: true });
      vi.mocked(apiService.orders.openCart).mockResolvedValue({
        success: true,
        data: { id: "order-rest-2" } as any,
      });
      vi.mocked(apiService.orderItems.addProductToCart).mockResolvedValue({ success: true });

      await act(async () => {
        added = await result.current.handleAddToCart({
          id: "p2",
          name: "Hambúrguer",
          price: 25,
          restaurantId: "rest-2",
          restaurantName: "Hamburgueria Bear",
        });
      });

      expect(added).toBe(true);
      // Carrinho agora pertence ao Restaurante 2
      expect(useCartStore.getState().restaurant?.id).toBe("rest-2");
    });
  });

  describe("2. Regras de Cupons e Descontos", () => {
    it("aplica cupom percentual de primeira compra (PRIMEIRA20)", () => {
      expect(isValidPromoCode("PRIMEIRA20")).toBe(true);

      const subtotal = 100.0;
      const discount = getPromoDiscount("PRIMEIRA20", subtotal);
      expect(discount).toBe(20.0); // 20% de 100
    });

    it("aplica cupom de desconto no frete (FRETE10) sem deixar o frete negativo", () => {
      expect(isValidPromoCode("FRETE10")).toBe(true);

      // Frete de R$ 15 -> desconta R$ 10
      expect(getDeliveryDiscount("FRETE10", 15.0)).toBe(10.0);

      // Frete de R$ 6 -> limita desconto a R$ 6 (frete nunca fica negativo)
      expect(getDeliveryDiscount("FRETE10", 6.0)).toBe(6.0);
    });

    it("rejeita cupons inválidos ou desconhecidos", () => {
      expect(isValidPromoCode("CUPOM_FALSO")).toBe(false);
      expect(getPromoDiscount("CUPOM_FALSO", 100.0)).toBe(0);
      expect(getDeliveryDiscount("CUPOM_FALSO", 10.0)).toBe(0);
    });
  });

  describe("3. Finalização de Compra (Checkout) - Cenários de Entrega e Pagamento", () => {
    // Carrinho do backend todo da loja do checkout: a conferência antes de
    // finalizar (LDMF-317) passa
    beforeEach(() => {
      vi.mocked(apiService.orders.viewOrder).mockResolvedValue({
        success: true,
        data: {
          id: "cart-order-1",
          companyId: "rest-1",
          orderedItems: [{ productId: "p1", product: { companyId: "rest-1" } }],
        } as unknown as Order,
      });
    });

    it("Cenário A: Compra com Entrega, Endereço Padrão e Cartão de Crédito", async () => {
      loginUser();
      act(() => {
        useCartStore.getState().setRestaurant(RESTAURANT_1);
        useCartStore.getState().setItems([{
          id: "item-1",
          productId: "p1",
          name: "Pizza Margherita",
          price: 50.0,
          quantity: 1,
          restaurantId: "rest-1",
          restaurantName: "Pizzaria do Urso",
        }]);
      });

      const { result } = renderHook(() => useCheckoutProcess(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.selectedAddressId).toBe("addr-home"));

      act(() => {
        result.current.setOrderType("delivery");
        result.current.setPaymentMethod("credit_card_machine");
      });

      expect(result.current.isFormValid()).toBe(true);

      await act(async () => {
        await result.current.handleSubmitOrder();
      });

      // finishOrder enviado com DELIVERY
      expect(finishOrder).toHaveBeenCalledTimes(1);
      expect(finishOrder.mock.calls[0][2]).toEqual({ fulfillmentType: "DELIVERY" });

      // Pagamento criado com CREDIT_CARD
      expect(paymentsCreate).toHaveBeenCalledTimes(1);
      expect(paymentsCreate.mock.calls[0][0]).toMatchObject({
        orderId: "order-123",
        paymentMethod: "CREDIT_CARD",
        amount: 60.0, // 50 + 10 frete
      });

      expect(playMock).toHaveBeenCalledWith("order-confirmed");
      expect(toastSuccess).toHaveBeenCalledWith("Pedido realizado com sucesso!");
      expect(pushMock).toHaveBeenCalledWith("/orders");
    });

    it("Cenário B: Compra com Retirada no Balcão (PICKUP) e Pix", async () => {
      loginUser();
      act(() => {
        useCartStore.getState().setRestaurant(RESTAURANT_1);
        useCartStore.getState().setItems([{
          id: "item-1",
          productId: "p1",
          name: "Pizza Margherita",
          price: 50.0,
          quantity: 1,
          restaurantId: "rest-1",
          restaurantName: "Pizzaria do Urso",
        }]);
      });

      const { result } = renderHook(() => useCheckoutProcess(), { wrapper: createWrapper() });

      act(() => {
        result.current.setOrderType("pickup");
        result.current.setPaymentMethod("pix_on_delivery");
      });

      expect(result.current.isFormValid()).toBe(true);

      await act(async () => {
        await result.current.handleSubmitOrder();
      });

      // Retirada não define endereço e tem fulfillmentType PICKUP
      expect(finishOrder.mock.calls[0][2]).toEqual({ fulfillmentType: "PICKUP" });
      expect(paymentsCreate.mock.calls[0][0]).toMatchObject({
        paymentMethod: "PIX",
      });
    });

    it("Cenário C: Compra em Dinheiro com Troco Válido", async () => {
      loginUser();
      act(() => {
        useCartStore.getState().setRestaurant(RESTAURANT_1);
        useCartStore.getState().setItems([{
          id: "item-1",
          productId: "p1",
          name: "Lanche",
          price: 25.0,
          quantity: 1,
          restaurantId: "rest-1",
          restaurantName: "Pizzaria do Urso",
        }]);
      });

      const { result } = renderHook(() => useCheckoutProcess(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.selectedAddressId).toBe("addr-home"));

      act(() => {
        result.current.setOrderType("delivery");
        result.current.setPaymentMethod("cash");
        result.current.setNeedsChange(true);
        result.current.setChangeAmount("50,00"); // Total é 35 (25 + 10 frete), paga com 50
      });

      expect(result.current.isFormValid()).toBe(true);

      await act(async () => {
        await result.current.handleSubmitOrder();
      });

      expect(finishOrder.mock.calls[0][2]).toEqual({
        fulfillmentType: "DELIVERY",
        changeFor: 50.0,
      });
      expect(paymentsCreate.mock.calls[0][0]).toMatchObject({
        paymentMethod: "CASH",
      });
    });

    it("Cenário D: Compra em Dinheiro com Troco Inválido (menor que o total) bloqueia", async () => {
      loginUser();
      act(() => {
        useCartStore.getState().setRestaurant(RESTAURANT_1);
        useCartStore.getState().setItems([{
          id: "item-1",
          productId: "p1",
          name: "Lanche",
          price: 25.0,
          quantity: 1,
          restaurantId: "rest-1",
          restaurantName: "Pizzaria do Urso",
        }]);
      });

      const { result } = renderHook(() => useCheckoutProcess(), { wrapper: createWrapper() });

      act(() => {
        result.current.setOrderType("delivery");
        result.current.setPaymentMethod("cash");
        result.current.setNeedsChange(true);
        result.current.setChangeAmount("20,00"); // Total é 35, valor 20 é insuficiente!
      });

      // Formulário fica inválido e não permite submissão
      expect(result.current.isFormValid()).toBe(false);
    });

    it("Cenário E: Falha na API ao finalizar preserva o carrinho do cliente", async () => {
      loginUser();
      act(() => {
        useCartStore.getState().setRestaurant(RESTAURANT_1);
        useCartStore.getState().setItems([{
          id: "item-1",
          productId: "p1",
          name: "Item Salvo",
          price: 30.0,
          quantity: 1,
          restaurantId: "rest-1",
          restaurantName: "Pizzaria do Urso",
        }]);
      });

      // Simula erro da API (ex: restaurante encerrou expediente)
      finishOrder.mockResolvedValueOnce({ success: false, message: "Restaurante fechado no momento" });

      const { result } = renderHook(() => useCheckoutProcess(), { wrapper: createWrapper() });
      await waitFor(() => expect(result.current.selectedAddressId).toBe("addr-home"));

      act(() => {
        result.current.setOrderType("delivery");
        result.current.setPaymentMethod("pix");
      });

      await act(async () => {
        await result.current.handleSubmitOrder();
      });

      // Notifica erro e o carrinho continua com o item intacto
      expect(toastError).toHaveBeenCalledWith("Restaurante fechado no momento");
      expect(useCartStore.getState().items).toHaveLength(1);
      expect(useCartStore.getState().items[0].name).toBe("Item Salvo");
    });

    it("Cenário F: Compra finalizada por conta de restaurante (owner) redireciona para order-status para evitar Acesso Negado", async () => {
      loginUser("owner");
      act(() => {
        useCartStore.getState().setRestaurant(RESTAURANT_1);
        useCartStore.getState().setItems([{
          id: "item-1",
          productId: "p1",
          name: "Lanche",
          price: 25.0,
          quantity: 1,
          restaurantId: "rest-1",
          restaurantName: "Pizzaria do Urso",
        }]);
      });

      const { result } = renderHook(() => useCheckoutProcess(), { wrapper: createWrapper() });

      act(() => {
        result.current.setOrderType("pickup");
        result.current.setPaymentMethod("pix_on_delivery");
      });

      await act(async () => {
        await result.current.handleSubmitOrder();
      });

      expect(pushMock).toHaveBeenCalledWith("/order-status?orderId=order-123");
    });
  });
});
