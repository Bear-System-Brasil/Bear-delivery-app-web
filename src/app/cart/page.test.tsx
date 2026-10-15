import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CartPage from "./page";
import type { Product, ProductVariation } from "@/services/api";
import type { CartItem } from "@/stores/cart-store";

const pushMock = vi.fn();
const handleUpdateQuantity = vi.fn();
const handleRemoveFromCart = vi.fn();
const handleGoToCheckout = vi.fn();
const refetchVariations = vi.fn();
const refetchProducts = vi.fn();

let cartItems: CartItem[] = [];
let mockProducts: Product[] = [];
let mockVariations: ProductVariation[] = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} src={src} />
  ),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/components/main-header", () => ({
  MainHeader: () => <div data-testid="main-header" />,
}));

vi.mock("@/components/ui/animated-background", () => ({
  AnimatedBackground: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/hooks", () => ({
  useCartActions: () => ({
    items: cartItems,
    totalItems: cartItems.reduce((acc, i) => acc + i.quantity, 0),
    totalPrice: cartItems.reduce((acc, i) => acc + i.price * i.quantity, 0),
    handleUpdateQuantity,
    handleRemoveFromCart,
    handleGoToCheckout,
  }),
  useRestaurant: () => ({
    data: { id: "rest-1", tradeName: "Pizzaria do Urso", isOpen: true },
  }),
  useRestaurantOpeningHours: () => ({
    data: { isOpen: true, linkedToCashRegister: true, days: [] },
  }),
  useCompanyProducts: () => ({
    data: mockProducts,
    refetch: refetchProducts,
  }),
  usePublicCompanyProductVariations: () => ({
    data: mockVariations,
    refetch: refetchVariations,
  }),
}));

describe("CartPage - checagem de estoque (LDMF-273)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refetchVariations.mockResolvedValue({ data: mockVariations });
    refetchProducts.mockResolvedValue({ data: mockProducts });
  });

  it("exibe badge 'Esgotado', desabilita botão + e trava botão de finalizar quando item está sem estoque", () => {
    cartItems = [
      {
        id: "l1",
        productId: "p1",
        name: "Pizza Margherita",
        price: 40,
        quantity: 1,
        restaurantId: "rest-1",
        restaurantName: "Pizzaria do Urso",
      },
    ];
    mockProducts = [
      {
        id: "p1",
        name: "Pizza Margherita",
        description: "",
        salePrice: 40,
        isAvailable: true,
        companyId: "rest-1",
        stockQuantity: 0, // esgotado
      },
    ];
    mockVariations = [];

    render(<CartPage />);

    expect(screen.getByText("Esgotado")).toBeInTheDocument();
    expect(screen.getByText("Item sem estoque")).toBeInTheDocument();

    const increaseBtn = screen.getByLabelText("Aumentar quantidade de Pizza Margherita");
    expect(increaseBtn).toBeDisabled();

    const checkoutBtn = screen.getByRole("button", {
      name: "Itens esgotados no carrinho",
    });
    expect(checkoutBtn).toBeDisabled();
  });

  it("exibe 'Estoque insuficiente' e desabilita botão + quando quantidade no carrinho excede o estoque", () => {
    cartItems = [
      {
        id: "l1",
        productId: "p1",
        name: "Pizza Margherita",
        price: 40,
        quantity: 5,
        restaurantId: "rest-1",
        restaurantName: "Pizzaria do Urso",
      },
    ];
    mockProducts = [
      {
        id: "p1",
        name: "Pizza Margherita",
        description: "",
        salePrice: 40,
        isAvailable: true,
        companyId: "rest-1",
        stockQuantity: 3, // só tem 3
      },
    ];
    mockVariations = [];

    render(<CartPage />);

    expect(screen.getByText("Estoque insuficiente")).toBeInTheDocument();
    expect(screen.getByText("Apenas 3 disponíveis")).toBeInTheDocument();

    const increaseBtn = screen.getByLabelText("Aumentar quantidade de Pizza Margherita");
    expect(increaseBtn).toBeDisabled();

    const checkoutBtn = screen.getByRole("button", {
      name: "Itens esgotados no carrinho",
    });
    expect(checkoutBtn).toBeDisabled();
  });

  it("permite finalizar pedido quando todos os itens possuem estoque suficiente", async () => {
    const user = userEvent.setup();
    cartItems = [
      {
        id: "l1",
        productId: "p1",
        name: "Pizza Margherita",
        price: 40,
        quantity: 2,
        restaurantId: "rest-1",
        restaurantName: "Pizzaria do Urso",
      },
    ];
    mockProducts = [
      {
        id: "p1",
        name: "Pizza Margherita",
        description: "",
        salePrice: 40,
        isAvailable: true,
        companyId: "rest-1",
        stockQuantity: 10,
      },
    ];
    mockVariations = [];

    refetchProducts.mockResolvedValue({ data: mockProducts });
    refetchVariations.mockResolvedValue({ data: mockVariations });

    render(<CartPage />);

    const checkoutBtn = screen.getByRole("button", { name: "Finalizar pedido" });
    expect(checkoutBtn).toBeEnabled();

    await user.click(checkoutBtn);

    await waitFor(() => {
      expect(refetchProducts).toHaveBeenCalled();
      expect(refetchVariations).toHaveBeenCalled();
      expect(handleGoToCheckout).toHaveBeenCalled();
    });
  });

  it("recheca estoque ao clicar em Finalizar pedido e bloqueia se item esgotou no backend", async () => {
    const user = userEvent.setup();
    cartItems = [
      {
        id: "l1",
        productId: "p1",
        name: "Pizza Margherita",
        price: 40,
        quantity: 2,
        restaurantId: "rest-1",
        restaurantName: "Pizzaria do Urso",
      },
    ];
    // Em tela parecia ter estoque...
    mockProducts = [
      {
        id: "p1",
        name: "Pizza Margherita",
        description: "",
        salePrice: 40,
        isAvailable: true,
        companyId: "rest-1",
        stockQuantity: 10,
      },
    ];
    mockVariations = [];

    // ...mas a rechecagem do servidor devolve que esgotou!
    refetchProducts.mockResolvedValue({
      data: [
        {
          id: "p1",
          name: "Pizza Margherita",
          description: "",
          salePrice: 40,
          isAvailable: true,
          companyId: "rest-1",
          stockQuantity: 0,
        },
      ],
    });
    refetchVariations.mockResolvedValue({ data: [] });

    render(<CartPage />);

    const checkoutBtn = screen.getByRole("button", { name: "Finalizar pedido" });
    await user.click(checkoutBtn);

    await waitFor(() => {
      expect(refetchProducts).toHaveBeenCalled();
      expect(handleGoToCheckout).not.toHaveBeenCalled();
    });
  });

  it("exibe badge 'Esgotado' e desabilita botão + quando a variação escolhida está sem estoque", () => {
    cartItems = [
      {
        id: "l1",
        productId: "p1",
        name: "Pizza Margherita",
        price: 50,
        quantity: 1,
        restaurantId: "rest-1",
        restaurantName: "Pizzaria do Urso",
        variations: [{ productVariationId: "v-grande" }],
      },
    ];
    mockProducts = [];
    mockVariations = [
      {
        id: "v-grande",
        productId: "p1",
        name: "Grande",
        priceModifier: 10,
        isAvailable: true,
        stockQuantity: 0, // variação esgotada
        created_at: "",
        updated_at: "",
      },
    ];

    render(<CartPage />);

    expect(screen.getByText("Esgotado")).toBeInTheDocument();
    expect(screen.getByText("Item sem estoque")).toBeInTheDocument();

    const increaseBtn = screen.getByLabelText("Aumentar quantidade de Pizza Margherita");
    expect(increaseBtn).toBeDisabled();

    const checkoutBtn = screen.getByRole("button", {
      name: "Itens esgotados no carrinho",
    });
    expect(checkoutBtn).toBeDisabled();
  });

  it("exibe 'Estoque insuficiente' quando quantidade de item com variação excede o estoque da variação", () => {
    cartItems = [
      {
        id: "l1",
        productId: "p1",
        name: "Pizza Margherita",
        price: 50,
        quantity: 3,
        restaurantId: "rest-1",
        restaurantName: "Pizzaria do Urso",
        variations: [{ productVariationId: "v-grande" }],
      },
    ];
    mockProducts = [];
    mockVariations = [
      {
        id: "v-grande",
        productId: "p1",
        name: "Grande",
        priceModifier: 10,
        isAvailable: true,
        stockQuantity: 2, // só tem 2 da variação grande
        created_at: "",
        updated_at: "",
      },
    ];

    render(<CartPage />);

    expect(screen.getByText("Estoque insuficiente")).toBeInTheDocument();
    expect(screen.getByText("Apenas 2 disponíveis")).toBeInTheDocument();

    const increaseBtn = screen.getByLabelText("Aumentar quantidade de Pizza Margherita");
    expect(increaseBtn).toBeDisabled();

    const checkoutBtn = screen.getByRole("button", {
      name: "Itens esgotados no carrinho",
    });
    expect(checkoutBtn).toBeDisabled();
  });
});
