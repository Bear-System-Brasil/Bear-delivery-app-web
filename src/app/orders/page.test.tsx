import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrderHistoryPage from "./page";
import { apiService } from "@/services/api";
import type { CustomerOrder } from "@/constants/order-management";

// Referências estáveis: mock com identidade nova a cada render causa laço
// infinito nos testes deste projeto (CLAUDE.md)
const router = { push: vi.fn(), back: vi.fn() };
const handleAddToCart = vi.fn();
const refreshHistory = vi.fn();
const AUTH = { user: { id: "user-1", role: "client" } };

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

vi.mock("@/hooks", () => ({
  useCartActions: () => ({ totalItems: 0, handleAddToCart }),
  useOrderHistory: () => ({
    orders: ORDERS,
    loading: false,
    error: null,
    refreshHistory,
  }),
  useRestaurants: () => ({ data: RESTAURANTS }),
}));

vi.mock("@/stores/auth-store", () => ({ useAuthStore: () => AUTH }));

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
});
