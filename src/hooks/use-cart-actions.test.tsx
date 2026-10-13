import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/stores/auth-store";
import { useCartStore, type CartItem } from "@/stores/cart-store";
import { useCartActions } from "./use-cart-actions";
import { apiService, type Order } from "@/services/api";
import { toast } from "sonner";

// Os testes só leem o id do pedido; o resto do Order não importa aqui.
const orderStub = (id: string) => ({ id }) as Order;

const { pushMock, confirmMock, playMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  confirmMock: vi.fn().mockResolvedValue(true),
  playMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/contexts/confirm-provider", () => ({
  useConfirm: () => ({ confirm: confirmMock }),
}));

vi.mock("@/hooks/use-sound", () => ({
  useSound: () => ({ play: playMock }),
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
        openCart: vi.fn(),
        viewOrder: vi.fn(),
        clearCart: vi.fn(),
      },
      orderItems: {
        addProductToCart: vi.fn(),
        removeProductFromCart: vi.fn(),
      },
      productAddOns: { getAllPublic: vi.fn() },
      productVariations: { getAllPublic: vi.fn() },
      openingHours: { getByCompany: vi.fn() },
    },
  };
});

const initialAuthState = useAuthStore.getState();
const initialCartState = useCartStore.getState();

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function renderCartActions() {
  return renderHook(() => useCartActions(), { wrapper });
}

function login(role = "client") {
  act(() => {
    useAuthStore.getState().login({
      id: "user-1",
      name: "Cliente Teste",
      email: "cliente@example.com",
      cpf: "",
      phone: "",
      birthDate: "",
      role,
    });
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("useCartActions", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    useAuthStore.setState(initialAuthState, true);
    useCartStore.setState(initialCartState, true);

    confirmMock.mockResolvedValue(true);
    // Sync-on-mount não deve interferir nos testes: sem carrinho no backend.
    vi.mocked(apiService.orders.viewOrder).mockResolvedValue({ success: false });
    vi.mocked(apiService.openingHours.getByCompany).mockResolvedValue({
      success: true,
      data: {
        isOpen: true,
        linkedToCashRegister: true,
        days: [
          {
            day: "mon",
            isOpen: true,
            openTime: "00:00",
            closeTime: "23:59",
          },
        ],
      } as any,
    });
  });

  describe("handleAddToCart", () => {
    it("exige usuário logado - sem login, mostra erro e não cria carrinho", async () => {
      const { result } = renderCartActions();

      let added: boolean | undefined;
      await act(async () => {
        added = await result.current.handleAddToCart({
          id: "prod-1",
          name: "Pizza",
          price: 30,
          restaurantId: "r1",
          restaurantName: "Pizzaria",
        });
      });

      expect(added).toBe(false);
      expect(toast.error).toHaveBeenCalledWith(
        "Você precisa estar logado para adicionar itens ao carrinho",
      );
      expect(apiService.orders.openCart).not.toHaveBeenCalled();
    });

    it("bloqueia adicionar ao carrinho quando o restaurante está fechado", async () => {
      login();
      vi.mocked(apiService.openingHours.getByCompany).mockResolvedValue({
        success: true,
        data: {
          isOpen: false,
          linkedToCashRegister: false,
          days: [
            {
              day: "mon",
              isOpen: false,
              openTime: "18:00",
              closeTime: "23:00",
            },
          ],
        } as any,
      });

      const { result } = renderCartActions();

      let added: boolean | undefined;
      await act(async () => {
        added = await result.current.handleAddToCart({
          id: "prod-1",
          name: "Pizza",
          price: 30,
          restaurantId: "r1",
          restaurantName: "Pizzaria",
        });
      });

      expect(added).toBe(false);
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Restaurante fechado"),
      );
      expect(useCartStore.getState().items).toHaveLength(0);
      expect(apiService.orders.openCart).not.toHaveBeenCalled();
    });

    it("cria um carrinho novo quando não há orderId, e adiciona o item otimisticamente", async () => {
      login();
      vi.mocked(apiService.orders.openCart).mockResolvedValue({
        success: true,
        data: orderStub("order-99"),
      });
      vi.mocked(apiService.orderItems.addProductToCart).mockResolvedValue({
        success: true,
        data: orderStub("order-99"),
      });

      const { result } = renderCartActions();

      let added: boolean | undefined;
      await act(async () => {
        added = await result.current.handleAddToCart({
          id: "prod-1",
          name: "Pizza",
          price: 30,
          restaurantId: "r1",
          restaurantName: "Pizzaria",
        });
      });

      expect(added).toBe(true);
      // Otimista: item já aparece no store antes mesmo do POST resolver.
      expect(useCartStore.getState().items).toHaveLength(1);
      expect(useCartStore.getState().items[0]).toMatchObject({
        productId: "prod-1",
        name: "Pizza",
        quantity: 1,
      });
      expect(useCartStore.getState().orderId).toBe("order-99");
      expect(playMock).toHaveBeenCalledWith("cart-add");

      await waitFor(() => {
        expect(apiService.orderItems.addProductToCart).toHaveBeenCalledWith(
          "order-99",
          "prod-1",
          "user-1",
          1,
          expect.anything(),
          expect.anything(),
        );
      });
      // O backend não recebe observação do prato (LDMF-254): não vai no POST
      expect(
        vi.mocked(apiService.orderItems.addProductToCart).mock.calls[0][4],
      ).not.toHaveProperty("observations");
    });

    it("reusa o orderId existente, sem criar um novo carrinho", async () => {
      login();
      act(() => useCartStore.getState().setOrderId("order-existing"));
      vi.mocked(apiService.orderItems.addProductToCart).mockResolvedValue({ success: true });

      const { result } = renderCartActions();

      await act(async () => {
        await result.current.handleAddToCart({
          id: "prod-1",
          name: "Pizza",
          price: 30,
          restaurantId: "r1",
          restaurantName: "Pizzaria",
        });
      });

      expect(apiService.orders.openCart).not.toHaveBeenCalled();
      expect(useCartStore.getState().orderId).toBe("order-existing");
    });

    it("a mesma combinação de produto+variação+adicional soma quantidade na mesma linha", async () => {
      login();
      act(() => useCartStore.getState().setOrderId("order-1"));
      vi.mocked(apiService.orderItems.addProductToCart).mockResolvedValue({ success: true });

      const { result } = renderCartActions();

      const item = {
        id: "prod-1",
        name: "Pizza",
        price: 30,
        restaurantId: "r1",
        restaurantName: "Pizzaria",
        variations: [{ productVariationId: "v-grande" }],
      };

      await act(async () => {
        await result.current.handleAddToCart(item);
      });
      await act(async () => {
        await result.current.handleAddToCart(item);
      });

      const items = useCartStore.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0].quantity).toBe(2);
    });

    it("a mesma base de produto com variação diferente vira uma linha separada", async () => {
      login();
      act(() => useCartStore.getState().setOrderId("order-1"));
      vi.mocked(apiService.orderItems.addProductToCart).mockResolvedValue({ success: true });

      const { result } = renderCartActions();

      await act(async () => {
        await result.current.handleAddToCart({
          id: "prod-1",
          name: "Pizza P",
          price: 20,
          restaurantId: "r1",
          restaurantName: "Pizzaria",
          variations: [{ productVariationId: "v-pequena" }],
        });
      });
      await act(async () => {
        await result.current.handleAddToCart({
          id: "prod-1",
          name: "Pizza G",
          price: 35,
          restaurantId: "r1",
          restaurantName: "Pizzaria",
          variations: [{ productVariationId: "v-grande" }],
        });
      });

      const items = useCartStore.getState().items;
      expect(items).toHaveLength(2);
      expect(items.map((i) => i.quantity)).toEqual([1, 1]);
    });

    it("trocar de restaurante pede confirmação; cancelando, mantém o carrinho como estava", async () => {
      login();
      act(() => {
        useCartStore.getState().setOrderId("order-1");
        useCartStore.getState().setRestaurant({ id: "r1", name: "Pizzaria" });
        useCartStore.getState().setItems([
          { id: "linha-1", productId: "prod-1", name: "Pizza", price: 30, quantity: 1, restaurantId: "r1", restaurantName: "Pizzaria" } as CartItem,
        ]);
      });
      confirmMock.mockResolvedValueOnce(false);

      const { result } = renderCartActions();

      let added: boolean | undefined;
      await act(async () => {
        added = await result.current.handleAddToCart({
          id: "prod-2",
          name: "Burger",
          price: 25,
          restaurantId: "r2",
          restaurantName: "Burgueria",
        });
      });

      expect(confirmMock).toHaveBeenCalled();
      expect(added).toBe(false);
      expect(useCartStore.getState().items).toHaveLength(1);
      expect(useCartStore.getState().restaurant?.id).toBe("r1");
    });

    it("trocar de restaurante e confirmar limpa o carrinho antigo e cria um pedido pro novo", async () => {
      login();
      act(() => {
        useCartStore.getState().setOrderId("order-1");
        useCartStore.getState().setRestaurant({ id: "r1", name: "Pizzaria" });
        useCartStore.getState().setItems([
          { id: "linha-1", productId: "prod-1", name: "Pizza", price: 30, quantity: 1, restaurantId: "r1", restaurantName: "Pizzaria" } as CartItem,
        ]);
      });
      confirmMock.mockResolvedValueOnce(true);
      vi.mocked(apiService.orders.clearCart).mockResolvedValue({ success: true });
      vi.mocked(apiService.orders.openCart).mockResolvedValue({
        success: true,
        data: orderStub("order-2"),
      });
      vi.mocked(apiService.orderItems.addProductToCart).mockResolvedValue({ success: true });

      const { result } = renderCartActions();

      let added: boolean | undefined;
      await act(async () => {
        added = await result.current.handleAddToCart({
          id: "prod-2",
          name: "Burger",
          price: 25,
          restaurantId: "r2",
          restaurantName: "Burgueria",
        });
      });

      expect(added).toBe(true);
      expect(useCartStore.getState().restaurant?.id).toBe("r2");
      expect(useCartStore.getState().items.map((i) => i.productId)).toEqual(["prod-2"]);
    });

    it("quando o backend recusa o item (success:false), desfaz a atualização otimista", async () => {
      login();
      act(() => useCartStore.getState().setOrderId("order-1"));
      vi.mocked(apiService.orderItems.addProductToCart).mockResolvedValue({
        success: false,
        message: "Produto sem estoque",
      });

      const { result } = renderCartActions();

      await act(async () => {
        await result.current.handleAddToCart({
          id: "prod-1",
          name: "Pizza",
          price: 30,
          restaurantId: "r1",
          restaurantName: "Pizzaria",
        });
      });

      // O mock resolve tão rápido quanto o próprio handleAddToCart, então a
      // reversão pode já ter acontecido pelo tempo em que o `act` acima
      // termina de drenar microtasks - o que importa é o estado final.
      await waitFor(() => {
        expect(useCartStore.getState().items).toHaveLength(0);
      });
      expect(toast.error).toHaveBeenCalledWith("Produto sem estoque");
    });

    it("404 no orderId salvo recria o carrinho e reenvia o item automaticamente", async () => {
      login();
      act(() => useCartStore.getState().setOrderId("order-morto"));
      vi.mocked(apiService.orderItems.addProductToCart)
        .mockResolvedValueOnce({ success: false, status: 404, message: "not found" })
        .mockResolvedValueOnce({ success: true });
      vi.mocked(apiService.orders.openCart).mockResolvedValue({
        success: true,
        data: orderStub("order-novo"),
      });

      const { result } = renderCartActions();

      await act(async () => {
        await result.current.handleAddToCart({
          id: "prod-1",
          name: "Pizza",
          price: 30,
          restaurantId: "r1",
          restaurantName: "Pizzaria",
        });
      });

      await waitFor(() => {
        expect(apiService.orderItems.addProductToCart).toHaveBeenCalledTimes(2);
      });
      expect(useCartStore.getState().orderId).toBe("order-novo");
      // o item continua no carrinho local - a 2ª tentativa deu sucesso
      expect(useCartStore.getState().items).toHaveLength(1);
    });

    it("o reenvio depois do 404 mantém os complementos do prato", async () => {
      login();
      act(() => useCartStore.getState().setOrderId("order-morto"));
      vi.mocked(apiService.orderItems.addProductToCart)
        .mockResolvedValueOnce({ success: false, status: 404, message: "not found" })
        .mockResolvedValueOnce({ success: true });
      vi.mocked(apiService.orders.openCart).mockResolvedValue({
        success: true,
        data: orderStub("order-novo"),
      });

      const { result } = renderCartActions();

      await act(async () => {
        await result.current.handleAddToCart({
          id: "prod-1",
          name: "Pizza",
          price: 30,
          restaurantId: "r1",
          restaurantName: "Pizzaria",
          addOns: [{ productAddOnsId: "addon-1", quantity: 2 }],
        });
      });

      await waitFor(() => {
        expect(apiService.orderItems.addProductToCart).toHaveBeenCalledTimes(2);
      });
      expect(vi.mocked(apiService.orderItems.addProductToCart).mock.calls[1]).toEqual([
        "order-novo",
        "prod-1",
        "user-1",
        1,
        expect.objectContaining({
          addOns: [{ productAddOnsId: "addon-1", quantity: 2 }],
        }),
        expect.anything(),
      ]);
    });
  });

  describe("syncCartFromBackend - troca de conta (LDMF-239)", () => {
    it("descarta a resposta que chega depois do logout", async () => {
      login();
      const { result } = renderCartActions();

      let resolveView: (value: Awaited<ReturnType<typeof apiService.orders.viewOrder>>) => void = () => {};
      vi.mocked(apiService.orders.viewOrder).mockReturnValue(
        new Promise((resolve) => {
          resolveView = resolve;
        }),
      );

      let sync: Promise<void> = Promise.resolve();
      act(() => {
        sync = result.current.syncCartFromBackend();
      });
      act(() => useAuthStore.getState().logout());

      await act(async () => {
        resolveView({
          success: true,
          data: {
            id: "cart:user-1",
            companyId: "r1",
            orderedItems: [
              { productId: "prod-1", unitPrice: 30, quantity: 1, product: { name: "Pizza" } },
            ],
          } as unknown as Order,
        });
        await sync;
      });

      expect(useCartStore.getState().items).toEqual([]);
      expect(useCartStore.getState().orderId).toBeNull();
    });
  });

  describe("handleRemoveFromCart", () => {
    it("remove otimisticamente e, se a API falhar, devolve o item ao carrinho", async () => {
      login();
      const item: CartItem = {
        id: "linha-1",
        productId: "prod-1",
        name: "Pizza",
        price: 30,
        quantity: 1,
        restaurantId: "r1",
        restaurantName: "Pizzaria",
      };
      act(() => {
        useCartStore.getState().setOrderId("order-1");
        useCartStore.getState().setItems([item]);
      });
      vi.mocked(apiService.orderItems.removeProductFromCart).mockRejectedValue(
        new Error("falhou"),
      );

      const { result } = renderCartActions();

      await act(async () => {
        await result.current.handleRemoveFromCart("linha-1");
      });

      await waitFor(() => {
        expect(useCartStore.getState().items).toHaveLength(1);
      });
      expect(toast.error).toHaveBeenCalledWith("Erro ao remover. Tente novamente.");
    });

    it("sem orderId, não faz nada (carrinho local já reflete o backend vazio)", async () => {
      login();
      const { result } = renderCartActions();

      await act(async () => {
        await result.current.handleRemoveFromCart("linha-inexistente");
      });

      expect(apiService.orderItems.removeProductFromCart).not.toHaveBeenCalled();
    });
  });

  describe("handleUpdateQuantity", () => {
    it("quantidade 0 remove o item em vez de chamar a API de atualização", async () => {
      login();
      const item: CartItem = {
        id: "linha-1",
        productId: "prod-1",
        name: "Pizza",
        price: 30,
        quantity: 1,
        restaurantId: "r1",
        restaurantName: "Pizzaria",
      };
      act(() => {
        useCartStore.getState().setOrderId("order-1");
        useCartStore.getState().setItems([item]);
      });
      vi.mocked(apiService.orderItems.removeProductFromCart).mockResolvedValue({ success: true });

      const { result } = renderCartActions();

      await act(async () => {
        await result.current.handleUpdateQuantity("linha-1", 0);
      });

      expect(useCartStore.getState().items).toHaveLength(0);
    });

    it("faz debounce: só a última quantidade chega na API depois de cliques rápidos", async () => {
      login();
      const item: CartItem = {
        id: "linha-1",
        productId: "prod-1",
        name: "Pizza",
        price: 30,
        quantity: 1,
        restaurantId: "r1",
        restaurantName: "Pizzaria",
      };
      act(() => {
        useCartStore.getState().setOrderId("order-1");
        useCartStore.getState().setItems([item]);
      });
      vi.mocked(apiService.orderItems.addProductToCart).mockResolvedValue({ success: true });

      const { result } = renderCartActions();

      await act(async () => {
        await result.current.handleUpdateQuantity("linha-1", 2);
        await result.current.handleUpdateQuantity("linha-1", 3);
        await result.current.handleUpdateQuantity("linha-1", 5);
      });

      expect(useCartStore.getState().items[0].quantity).toBe(5); // otimista, imediato

      await act(async () => {
        await sleep(350);
      });

      // diff = 5 (final) - 1 (original) = 4, numa única chamada - não 3 chamadas incrementais
      expect(apiService.orderItems.addProductToCart).toHaveBeenCalledTimes(1);
      expect(apiService.orderItems.addProductToCart).toHaveBeenCalledWith(
        "order-1",
        "prod-1",
        "user-1",
        4,
        expect.anything(),
        expect.anything(),
      );
    });

    it("se a atualização falhar no backend, reverte só a diferença tentada por essa chamada", async () => {
      login();
      const item: CartItem = {
        id: "linha-1",
        productId: "prod-1",
        name: "Pizza",
        price: 30,
        quantity: 2,
        restaurantId: "r1",
        restaurantName: "Pizzaria",
      };
      act(() => {
        useCartStore.getState().setOrderId("order-1");
        useCartStore.getState().setItems([item]);
      });
      vi.mocked(apiService.orderItems.addProductToCart).mockResolvedValue({
        success: false,
        message: "Sem estoque suficiente",
      });

      const { result } = renderCartActions();

      await act(async () => {
        await result.current.handleUpdateQuantity("linha-1", 5); // diff = +3
      });

      await act(async () => {
        await sleep(350);
      });

      await waitFor(() => {
        expect(useCartStore.getState().items[0].quantity).toBe(2); // 5 - 3
      });
      expect(toast.error).toHaveBeenCalledWith("Sem estoque suficiente");
    });
  });

  describe("handleUpdateQuantity - corrida entre rajadas e sync (LDMF-247)", () => {
    const LINE = "prod-1::::";

    const pizza = (quantity: number): CartItem => ({
      id: LINE,
      productId: "prod-1",
      name: "Pizza",
      price: 30,
      quantity,
      restaurantId: "r1",
      restaurantName: "Pizzaria",
    });

    const backendCart = (quantity: number) =>
      ({
        id: "order-1",
        companyId: "r1",
        orderedItems: [
          { productId: "prod-1", unitPrice: 30, quantity, product: { name: "Pizza" } },
        ],
      }) as unknown as Order;

    type Deferred = {
      resolve: () => void;
      fail: (message: string) => void;
      quantity: number;
      signal?: AbortSignal;
    };

    /**
     * Backend falso com o contrato do order-item: POST soma a quantidade
     * enviada, DELETE subtrai. Cada requisição fica parada até o teste
     * liberar - é assim que o teste controla a ordem das respostas.
     */
    function fakeBackend(initial: number) {
      let quantity = initial;
      const posts: Deferred[] = [];
      const deletes: Deferred[] = [];

      vi.mocked(apiService.orderItems.addProductToCart).mockImplementation(
        (_orderId, _productId, _userId, sent, _extras, signal) =>
          new Promise((resolve) => {
            posts.push({
              quantity: sent,
              signal,
              resolve: () => {
                quantity += sent;
                resolve({ success: true });
              },
              fail: (message) => resolve({ success: false, message }),
            });
          }),
      );
      vi.mocked(apiService.orderItems.removeProductFromCart).mockImplementation(
        (_userId, _orderId, _productId, sent, signal) =>
          new Promise((resolve) => {
            deletes.push({
              quantity: sent,
              signal,
              resolve: () => {
                quantity = Math.max(0, quantity - sent);
                resolve({ success: true });
              },
              fail: (message) => resolve({ success: false, message }),
            });
          }),
      );
      vi.mocked(apiService.orders.viewOrder).mockImplementation(async () => ({
        success: true,
        data: backendCart(quantity),
      }));

      return {
        posts,
        deletes,
        get quantity() {
          return quantity;
        },
      };
    }

    function setup(quantity: number) {
      login();
      act(() => {
        useCartStore.getState().setOrderId("order-1");
        useCartStore.getState().setItems([pizza(quantity)]);
      });
      return renderCartActions();
    }

    // Como a página faz: handleUpdateQuantity(id, item.quantity ± 1)
    async function click(
      result: { current: ReturnType<typeof useCartActions> },
      delta: 1 | -1,
    ) {
      await act(async () => {
        const item = result.current.items.find((i) => i.id === LINE)!;
        await result.current.handleUpdateQuantity(LINE, item.quantity + delta);
      });
    }

    const shownQuantity = () =>
      useCartStore.getState().items.find((i) => i.id === LINE)?.quantity;

    // Libera a requisição e deixa a fila andar
    async function release(request: Deferred) {
      await act(async () => {
        request.resolve();
        await sleep(0);
      });
    }

    beforeEach(() => {
      vi.mocked(apiService.productAddOns.getAllPublic).mockResolvedValue({ success: false });
      vi.mocked(apiService.productVariations.getAllPublic).mockResolvedValue({ success: false });
    });

    it("leitura iniciada antes dos cliques e respondida depois não sobrescreve a quantidade", async () => {
      const backend = fakeBackend(4);
      const { result } = setup(4);

      // Leitura que sai com o backend em 4 e só responde depois dos cliques
      let resolveStaleRead: () => void = () => {};
      vi.mocked(apiService.orders.viewOrder).mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveStaleRead = () => resolve({ success: true, data: backendCart(4) });
          }),
      );

      let sync: Promise<void> = Promise.resolve();
      await act(async () => {
        sync = result.current.syncCartFromBackend();
        await sleep(0);
      });
      for (let i = 0; i < 4; i++) await click(result, 1);
      expect(shownQuantity()).toBe(8);

      await act(async () => {
        resolveStaleRead();
        await sleep(0);
      });
      expect(shownQuantity()).toBe(8); // a resposta velha foi descartada

      await act(() => sleep(350));
      await release(backend.posts[0]);
      await act(() => sync);

      expect(backend.posts.map((p) => p.quantity)).toEqual([4]);
      expect(backend.quantity).toBe(8);
      expect(apiService.orders.viewOrder).toHaveBeenCalledTimes(2); // releu depois da escrita
      expect(shownQuantity()).toBe(8);
    });

    it("segunda rajada espera a primeira terminar, sem abortá-la, e manda só a diferença dela", async () => {
      const backend = fakeBackend(4);
      const { result } = setup(4);

      // Rajada 1: 4 -> 6
      await click(result, 1);
      await click(result, 1);
      await act(() => sleep(350));
      expect(backend.posts).toHaveLength(1);

      // Rajada 2: 6 -> 8, com o POST da rajada 1 ainda pendente
      await click(result, 1);
      await click(result, 1);
      await act(() => sleep(350));

      expect(backend.posts).toHaveLength(1); // a 2ª está na fila, não saiu
      expect(backend.posts[0].signal?.aborted).toBe(false);

      await release(backend.posts[0]);
      expect(backend.posts).toHaveLength(2);
      expect(backend.posts.map((p) => p.quantity)).toEqual([2, 2]);

      await release(backend.posts[1]);
      expect(backend.quantity).toBe(8);

      await act(() => result.current.syncCartFromBackend());
      expect(shownQuantity()).toBe(8);
    });

    it("sync chamado com rajada ainda no debounce espera ela chegar ao backend antes de ler", async () => {
      const backend = fakeBackend(4);
      const { result } = setup(4);

      await click(result, 1);
      await click(result, 1);

      let sync: Promise<void> = Promise.resolve();
      await act(async () => {
        sync = result.current.syncCartFromBackend();
        await sleep(0);
      });
      expect(apiService.orders.viewOrder).not.toHaveBeenCalled();

      await act(() => sleep(350));
      expect(apiService.orders.viewOrder).not.toHaveBeenCalled(); // POST em voo
      await release(backend.posts[0]);
      await act(() => sync);

      expect(apiService.orders.viewOrder).toHaveBeenCalledTimes(1);
      expect(shownQuantity()).toBe(6);
    });

    it("o \"–\" também enfileira: a segunda rajada espera o DELETE da primeira", async () => {
      const backend = fakeBackend(8);
      const { result } = setup(8);

      await click(result, -1);
      await click(result, -1);
      await act(() => sleep(350));
      await click(result, -1);
      await act(() => sleep(350));

      expect(backend.deletes.map((d) => d.quantity)).toEqual([2]);
      expect(backend.deletes[0].signal?.aborted).toBe(false);

      await release(backend.deletes[0]);
      expect(backend.deletes.map((d) => d.quantity)).toEqual([2, 1]);
      await release(backend.deletes[1]);

      await act(() => result.current.syncCartFromBackend());
      expect(backend.quantity).toBe(5);
      expect(shownQuantity()).toBe(5);
    });

    it("\"–\" até zero numa rajada só remove a quantidade que o backend tem, não a da tela", async () => {
      const backend = fakeBackend(3);
      const { result } = setup(3);

      await click(result, -1); // 2
      await click(result, -1); // 1
      await click(result, -1); // 0 -> remove a linha

      expect(useCartStore.getState().items).toEqual([]);
      expect(backend.deletes.map((d) => d.quantity)).toEqual([3]);
      await release(backend.deletes[0]);

      await act(() => sleep(350));
      expect(backend.posts).toHaveLength(0);
      expect(backend.deletes).toHaveLength(1); // a rajada descartada não sai depois
      expect(backend.quantity).toBe(0);
    });

    it("remover a linha com um \"+\" em voo espera o POST antes do DELETE", async () => {
      const backend = fakeBackend(4);
      const { result } = setup(4);

      await click(result, 1);
      await act(() => sleep(350));
      await act(async () => {
        await result.current.handleRemoveFromCart(LINE);
      });

      expect(backend.deletes).toHaveLength(0);
      await release(backend.posts[0]);
      expect(backend.deletes.map((d) => d.quantity)).toEqual([5]);
      await release(backend.deletes[0]);
      expect(backend.quantity).toBe(0);
    });

    it("sair da tela com uma rajada no debounce envia a rajada em vez de descartá-la", async () => {
      const backend = fakeBackend(4);
      const { result, unmount } = setup(4);

      await click(result, 1);
      await act(async () => {
        unmount();
        await sleep(0);
      });

      expect(backend.posts.map((p) => p.quantity)).toEqual([1]);
      await release(backend.posts[0]);
      expect(backend.quantity).toBe(5);
    });

    it("falha numa rajada reverte só ela e não trava a rajada seguinte", async () => {
      const backend = fakeBackend(4);
      const { result } = setup(4);

      await click(result, 1); // rajada 1: 5
      await act(() => sleep(350));
      await click(result, 1); // rajada 2: 6, na fila
      await act(() => sleep(350));

      await act(async () => {
        backend.posts[0].fail("Sem estoque suficiente");
        await sleep(0);
      });

      expect(shownQuantity()).toBe(5); // 6 - 1 da rajada recusada
      expect(toast.error).toHaveBeenCalledWith("Sem estoque suficiente");
      expect(backend.posts).toHaveLength(2);

      await release(backend.posts[1]);
      expect(backend.quantity).toBe(5);
    });
  });

  describe("handleClearCart", () => {
    it("chama a API e limpa o carrinho local", async () => {
      login();
      act(() => {
        useCartStore.getState().setOrderId("order-1");
        useCartStore.getState().setItems([
          { id: "l1", productId: "p1", name: "X", price: 1, quantity: 1, restaurantId: "r1", restaurantName: "R" } as CartItem,
        ]);
      });
      vi.mocked(apiService.orders.clearCart).mockResolvedValue({ success: true });

      const { result } = renderCartActions();

      await act(async () => {
        await result.current.handleClearCart();
      });

      expect(apiService.orders.clearCart).toHaveBeenCalledWith("user-1", "order-1");
      expect(useCartStore.getState().items).toEqual([]);
      expect(useCartStore.getState().orderId).toBeNull();
      expect(toast.success).toHaveBeenCalledWith("Carrinho limpo com sucesso");
    });

    it("mesmo se a API falhar, limpa o carrinho local (não deixa o usuário travado)", async () => {
      login();
      act(() => {
        useCartStore.getState().setOrderId("order-1");
        useCartStore.getState().setItems([
          { id: "l1", productId: "p1", name: "X", price: 1, quantity: 1, restaurantId: "r1", restaurantName: "R" } as CartItem,
        ]);
      });
      vi.mocked(apiService.orders.clearCart).mockRejectedValue(new Error("boom"));

      const { result } = renderCartActions();

      await act(async () => {
        await result.current.handleClearCart();
      });

      expect(useCartStore.getState().items).toEqual([]);
    });

    it("sem orderId, limpa só localmente sem chamar a API", async () => {
      login();
      const { result } = renderCartActions();

      await act(async () => {
        await result.current.handleClearCart();
      });

      expect(apiService.orders.clearCart).not.toHaveBeenCalled();
    });
  });

  describe("helpers derivados", () => {
    it("isItemInCart e getItemQuantity somam todas as combinações do mesmo produto", () => {
      act(() => {
        useCartStore.getState().setItems([
          { id: "l1", productId: "prod-1", name: "P", price: 10, quantity: 2, restaurantId: "r1", restaurantName: "R" } as CartItem,
          { id: "l2", productId: "prod-1", name: "P", price: 12, quantity: 3, restaurantId: "r1", restaurantName: "R" } as CartItem,
          { id: "l3", productId: "prod-2", name: "Q", price: 5, quantity: 1, restaurantId: "r1", restaurantName: "R" } as CartItem,
        ]);
      });

      const { result } = renderCartActions();

      expect(result.current.isItemInCart("prod-1")).toBe(true);
      expect(result.current.isItemInCart("prod-9")).toBe(false);
      expect(result.current.getItemQuantity("prod-1")).toBe(5);
      expect(result.current.getItemQuantity("prod-2")).toBe(1);
    });
  });

  describe("navegação", () => {
    it("handleGoToCheckout bloqueia com carrinho vazio", () => {
      const { result } = renderCartActions();

      act(() => result.current.handleGoToCheckout());

      expect(toast.error).toHaveBeenCalledWith("Seu carrinho está vazio");
      expect(pushMock).not.toHaveBeenCalled();
    });

    it("handleGoToCheckout navega para /checkout com itens no carrinho", () => {
      act(() => {
        useCartStore.getState().setItems([
          { id: "l1", productId: "p1", name: "X", price: 1, quantity: 1, restaurantId: "r1", restaurantName: "R" } as CartItem,
        ]);
      });

      const { result } = renderCartActions();
      act(() => result.current.handleGoToCheckout());

      expect(pushMock).toHaveBeenCalledWith("/checkout");
    });

    it("handleGoToCheckout bloqueia navegação quando restaurante em cache está fechado", () => {
      act(() => {
        useCartStore.getState().setItems([
          { id: "l1", productId: "p1", name: "X", price: 1, quantity: 1, restaurantId: "r1", restaurantName: "R" } as CartItem,
        ]);
      });

      const queryClient = new QueryClient();
      queryClient.setQueryData(["opening-hours", "public", "r1"], {
        data: {
          isOpen: false,
          linkedToCashRegister: false,
          days: [],
        },
      });

      const customWrapper = ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(() => useCartActions(), { wrapper: customWrapper });
      act(() => result.current.handleGoToCheckout());

      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining("Restaurante fechado"),
      );
      expect(pushMock).not.toHaveBeenCalledWith("/checkout");
    });

    it("handleGoToCart navega para /cart mesmo com carrinho vazio", () => {
      const { result } = renderCartActions();
      act(() => result.current.handleGoToCart());
      expect(pushMock).toHaveBeenCalledWith("/cart");
    });
  });

  describe("consolidação e agrupamento de itens repetidos no carrinho", () => {
    it("agrupa múltiplas entradas do mesmo produto sem variação somando as quantidades em 1 linha", async () => {
      login();
      useCartStore.getState().setOrderId("order-1");

      vi.mocked(apiService.orders.viewOrder).mockResolvedValue({
        success: true,
        data: {
          id: "order-1",
          companyId: "r1",
          orderedItems: [
            { productId: "prod-1", quantity: 1, unitPrice: 20, product: { name: "Burger" } },
            { productId: "prod-1", quantity: 1, unitPrice: 20, product: { name: "Burger" } },
          ],
        } as unknown as Order,
      });

      const { result } = renderCartActions();
      await act(async () => {
        await result.current.syncCartFromBackend();
      });

      const items = useCartStore.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0].productId).toBe("prod-1");
      expect(items[0].quantity).toBe(2);
      expect(items[0].price).toBe(20);
    });

    it("agrupa múltiplas entradas do mesmo produto com a MESMA variação somando as quantidades em 1 linha", async () => {
      login();
      useCartStore.getState().setOrderId("order-1");

      vi.mocked(apiService.orders.viewOrder).mockResolvedValue({
        success: true,
        data: {
          id: "order-1",
          companyId: "r1",
          orderedItems: [
            {
              productId: "prod-1",
              quantity: 1,
              unitPrice: 10,
              product: { name: "Suco" },
              variations: [{ productVariationId: "var-300ml", priceSnapshot: 2, name: "300ml" }],
            },
            {
              productId: "prod-1",
              quantity: 1,
              unitPrice: 10,
              product: { name: "Suco" },
              variations: [{ productVariationId: "var-300ml", priceSnapshot: 2, name: "300ml" }],
            },
          ],
        } as unknown as Order,
      });

      const { result } = renderCartActions();
      await act(async () => {
        await result.current.syncCartFromBackend();
      });

      const items = useCartStore.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0].productId).toBe("prod-1");
      expect(items[0].quantity).toBe(2);
      expect(items[0].price).toBe(12);
      expect(items[0].variationLabel).toBe("300ml");
    });

    it("mantém em linhas separadas o mesmo produto com variações DIFERENTES", async () => {
      login();
      useCartStore.getState().setOrderId("order-1");

      vi.mocked(apiService.orders.viewOrder).mockResolvedValue({
        success: true,
        data: {
          id: "order-1",
          companyId: "r1",
          orderedItems: [
            {
              productId: "prod-1",
              quantity: 1,
              unitPrice: 10,
              product: { name: "Suco" },
              variations: [{ productVariationId: "var-300ml", priceSnapshot: 2, name: "300ml" }],
            },
            {
              productId: "prod-1",
              quantity: 2,
              unitPrice: 10,
              product: { name: "Suco" },
              variations: [{ productVariationId: "var-500ml", priceSnapshot: 5, name: "500ml" }],
            },
          ],
        } as unknown as Order,
      });

      const { result } = renderCartActions();
      await act(async () => {
        await result.current.syncCartFromBackend();
      });

      const items = useCartStore.getState().items;
      expect(items).toHaveLength(2);
      expect(items.find((i) => i.variationLabel === "300ml")?.quantity).toBe(1);
      expect(items.find((i) => i.variationLabel === "500ml")?.quantity).toBe(2);
    });

    it("agrupa adicionais idênticos e mantém adicionais diferentes separados", async () => {
      login();
      useCartStore.getState().setOrderId("order-1");

      vi.mocked(apiService.orders.viewOrder).mockResolvedValue({
        success: true,
        data: {
          id: "order-1",
          companyId: "r1",
          orderedItems: [
            {
              productId: "prod-1",
              quantity: 1,
              unitPrice: 25,
              product: { name: "Pastel" },
              addOns: [{ productAddOnsId: "add-queijo", quantity: 1, priceSnapshot: 3, name: "Queijo" }],
            },
            {
              productId: "prod-1",
              quantity: 1,
              unitPrice: 25,
              product: { name: "Pastel" },
              addOns: [{ productAddOnsId: "add-queijo", quantity: 1, priceSnapshot: 3, name: "Queijo" }],
            },
            {
              productId: "prod-1",
              quantity: 1,
              unitPrice: 25,
              product: { name: "Pastel" },
              addOns: [{ productAddOnsId: "add-catupiry", quantity: 1, priceSnapshot: 4, name: "Catupiry" }],
            },
          ],
        } as unknown as Order,
      });

      const { result } = renderCartActions();
      await act(async () => {
        await result.current.syncCartFromBackend();
      });

      const items = useCartStore.getState().items;
      expect(items).toHaveLength(2);
      const queijoItem = items.find((i) => i.addOnLabels?.includes("Queijo"));
      const catupiryItem = items.find((i) => i.addOnLabels?.includes("Catupiry"));

      expect(queijoItem?.quantity).toBe(2);
      expect(queijoItem?.price).toBe(28);
      expect(catupiryItem?.quantity).toBe(1);
      expect(catupiryItem?.price).toBe(29);
    });

    it("adicionar duas vezes via handleAddToCart consolida no estado e resiste a sync com backend fragmentado", async () => {
      login();
      vi.mocked(apiService.orders.openCart).mockResolvedValue({
        success: true,
        data: { id: "order-1" } as Order,
      });
      vi.mocked(apiService.orderItems.addProductToCart).mockResolvedValue({
        success: true,
      } as unknown as Order);

      const { result } = renderCartActions();

      const itemPayload = {
        id: "prod-caldo",
        name: "Caldo de Cana",
        price: 6,
        quantity: 1,
        restaurantId: "r1",
        restaurantName: "Pastelaria",
        variations: [{ productVariationId: "var-300" }],
        variationLabel: "300 ml",
      };

      // Adiciona 1a vez
      await act(async () => {
        await result.current.handleAddToCart(itemPayload);
      });
      expect(useCartStore.getState().items).toHaveLength(1);
      expect(useCartStore.getState().items[0].quantity).toBe(1);

      // Adiciona 2a vez
      await act(async () => {
        await result.current.handleAddToCart(itemPayload);
      });
      expect(useCartStore.getState().items).toHaveLength(1);
      expect(useCartStore.getState().items[0].quantity).toBe(2);

      // Backend (Redis real) responde com 2 entradas separadas para o sync
      vi.mocked(apiService.orders.viewOrder).mockResolvedValue({
        success: true,
        data: {
          id: "order-1",
          companyId: "r1",
          orderedItems: [
            {
              productId: "prod-caldo",
              quantity: 1,
              unitPrice: 6,
              product: { name: "Caldo de Cana" },
              variations: [{ productVariationId: "var-300", name: "300 ml" }],
            },
            {
              productId: "prod-caldo",
              quantity: 1,
              unitPrice: 6,
              product: { name: "Caldo de Cana" },
              variations: [{ productVariationId: "var-300", name: "300 ml" }],
            },
          ],
        } as unknown as Order,
      });

      await act(async () => {
        await result.current.syncCartFromBackend();
      });

      // Permanece consolidado como 1 única linha com quantidade 2!
      const finalItems = useCartStore.getState().items;
      expect(finalItems).toHaveLength(1);
      expect(finalItems[0].quantity).toBe(2);
      expect(finalItems[0].name).toBe("Caldo de Cana");
      expect(finalItems[0].variationLabel).toBe("300 ml");
    });
  });
});
