import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrderHistoryPage from "./page";
import { apiService } from "@/services/api";
import { toast } from "sonner";
import type { CustomerOrder } from "@/constants/order-management";

// Referências estáveis: mock com identidade nova a cada render causa laço
// infinito nos testes deste projeto (CLAUDE.md)
const router = { push: vi.fn(), back: vi.fn() };
const handleAddToCart = vi.fn();
const refreshHistory = vi.fn();
const AUTH = { user: { id: "user-1", role: "client" } };
// Loja em que o carrinho está; a tela lê depois de cada recusa.
const CART: { restaurant: { id: string } | null } = { restaurant: null };

const ORDER_B = {
  id: "pedido-b",
  companyId: "rB",
  status: "COMPLETED",
  totalValue: 20,
  created_at: "2026-10-16T17:01:02.197Z",
  orderedItems: [],
} as unknown as CustomerOrder;
const ORDERS = [ORDER_B];
const RESTAURANTS = [{ id: "rB", tradeName: "Loja B", logo_url: "" }];

vi.mock("next/navigation", () => ({ useRouter: () => router }));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/components/main-header", () => ({
  MainHeader: () => <div data-testid="main-header" />,
}));

vi.mock("@/components/protected-route", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/animated-background", () => ({
  AnimatedBackground: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/hooks/use-cart-actions", () => ({
  useCartActions: () => ({ totalItems: 0, handleAddToCart }),
}))
vi.mock("@/hooks/use-order-history", () => ({
  useOrderHistory: () => ({
    orders: ORDERS,
    loading: false,
    error: null,
    refreshHistory,
  }),
}))
vi.mock("@/hooks/use-restaurants", () => ({
  useRestaurants: () => ({ data: RESTAURANTS }),
}))

vi.mock("@/stores/auth-store", () => ({ useAuthStore: () => AUTH }));
vi.mock("@/stores/cart-store", () => ({
  useCartStore: { getState: () => CART },
}));

vi.mock("@/services/api", () => ({
  apiService: {
    orders: { getCustomerOrder: vi.fn() },
    orderItems: { listByOrder: vi.fn() },
    getProduct: vi.fn(),
  },
}));

const item = (productId: string, name: string, quantity = 1) => ({
  id: `linha-${productId}`,
  orderId: "pedido-b",
  productId,
  quantity,
  unitPrice: 10,
  product: { id: productId, name, salePrice: 10, imageURL: [] },
});

describe("Meus pedidos - Pedir novamente (LDMF-317)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    CART.restaurant = null;
    handleAddToCart.mockResolvedValue(true);
    vi.mocked(apiService.orders.getCustomerOrder).mockResolvedValue({
      success: true,
      data: {
        ...ORDER_B,
        orderedItems: [item("sorvete-b1", "Sorvete B1"), item("sorvete-b2", "Sorvete B2", 2)],
      } as unknown as CustomerOrder,
    });
    // O que GET /order-item/order/:id devolve com carrinho aberto de outra
    // loja: os itens do carrinho, não os do pedido (medido em 16/10)
    vi.mocked(apiService.orderItems.listByOrder).mockResolvedValue({
      success: true,
      data: [item("burger-a1", "Burger A1")] as never,
    });
  });

  it("repete os itens do próprio pedido, não os do carrinho aberto", async () => {
    render(<OrderHistoryPage />);

    await userEvent.click(
      screen.getByRole("button", { name: "Pedir novamente" }),
    );

    await waitFor(() => expect(handleAddToCart).toHaveBeenCalledTimes(2));
    expect(apiService.orders.getCustomerOrder).toHaveBeenCalledWith("pedido-b");
    expect(apiService.orderItems.listByOrder).not.toHaveBeenCalled();
    expect(handleAddToCart.mock.calls.map(([added]) => added)).toEqual([
      expect.objectContaining({
        id: "sorvete-b1",
        name: "Sorvete B1",
        quantity: 1,
        restaurantId: "rB",
        restaurantName: "Loja B",
      }),
      expect.objectContaining({
        id: "sorvete-b2",
        name: "Sorvete B2",
        quantity: 2,
        restaurantId: "rB",
        restaurantName: "Loja B",
      }),
    ]);
    expect(router.push).toHaveBeenCalledWith("/cart");
  });

  const clickRepeat = () =>
    userEvent.click(screen.getByRole("button", { name: "Pedir novamente" }));

  it("loja recusada pelo carrinho (ex.: fechada) mostra só o aviso do carrinho e para no primeiro item", async () => {
    // O carrinho recusa e já mostra o motivo; o carrinho segue fora da loja.
    handleAddToCart.mockResolvedValue(false);
    render(<OrderHistoryPage />);

    await clickRepeat();

    await waitFor(() => expect(handleAddToCart).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pedir novamente" })).toBeEnabled(),
    );
    expect(toast.error).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("recusa de um item com o carrinho na loja segue para os outros itens", async () => {
    CART.restaurant = { id: "rB" };
    handleAddToCart.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    render(<OrderHistoryPage />);

    await clickRepeat();

    await waitFor(() => expect(handleAddToCart).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/cart"));
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("todos os itens recusados com o carrinho na loja: nenhum aviso extra além dos do carrinho", async () => {
    CART.restaurant = { id: "rB" };
    handleAddToCart.mockResolvedValue(false);
    render(<OrderHistoryPage />);

    await clickRepeat();

    await waitFor(() => expect(handleAddToCart).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Pedir novamente" })).toBeEnabled(),
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("sem nenhum item que dê para levar ao carrinho, avisa uma vez", async () => {
    vi.mocked(apiService.orders.getCustomerOrder).mockResolvedValue({
      success: true,
      data: { ...ORDER_B, orderedItems: [] } as unknown as CustomerOrder,
    });
    render(<OrderHistoryPage />);

    await clickRepeat();

    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error).toHaveBeenCalledWith("Itens indisponíveis para repetir");
    expect(handleAddToCart).not.toHaveBeenCalled();
  });
});
