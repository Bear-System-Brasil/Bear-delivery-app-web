import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { DeliveryWrapper } from "./index";

const { router, auth, cart, checkout } = vi.hoisted(() => ({
  router: { push: vi.fn() },
  auth: { isAuthenticated: true, showAuthModal: vi.fn() },
  cart: { syncCartFromBackend: vi.fn() },
  // Valores do useCheckoutProcess que cada teste ajusta.
  checkout: {} as Record<string, unknown>,
}));

vi.mock("next/navigation", () => ({ useRouter: () => router }));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/contexts/auth-provider", () => ({ useAuth: () => auth }));

vi.mock("@/hooks", () => ({
  useCartActions: () => cart,
  useCheckoutProcess: () => checkout,
}));

// Filhos viram marcadores: aqui só importa a orquestração entre as etapas.
vi.mock("@/components/checkout/delivery-form", () => ({
  DeliveryForm: () => <div>etapa-entrega</div>,
}));
vi.mock("@/components/checkout/payment-method", () => ({
  PaymentMethod: ({ total }: { total: number }) => (
    <div>etapa-pagamento total={total}</div>
  ),
}));
vi.mock("@/components/checkout/order-sumary", () => ({
  OrderSummary: ({
    step,
    onContinue,
    handleSubmitOrder,
  }: {
    step: 1 | 2;
    onContinue: () => void;
    handleSubmitOrder: () => void;
  }) =>
    step === 1 ? (
      <button onClick={onContinue}>Continuar</button>
    ) : (
      <button onClick={handleSubmitOrder}>Confirmar pedido</button>
    ),
}));
vi.mock("@/components/main-header", () => ({ MainHeader: () => null }));
vi.mock("@/components/ui/animated-background", () => ({
  AnimatedBackground: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}));

function setCheckout(overrides: Record<string, unknown> = {}) {
  for (const key of Object.keys(checkout)) delete checkout[key];
  Object.assign(checkout, {
    cartItems: [{ id: "i1" }],
    restaurant: { id: "r1", name: "Bear Burger" },
    orderType: "delivery",
    total: 42.5,
    isDeliveryValid: vi.fn(() => true),
    isFormValid: vi.fn(() => true),
    handleSubmitOrder: vi.fn(async () => {}),
    isProcessing: false,
    isNavigating: false,
    ...overrides,
  });
}

describe("DeliveryWrapper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.isAuthenticated = true;
    cart.syncCartFromBackend.mockResolvedValue(undefined);
    setCheckout();
  });

  it("começa na entrega e mostra o restaurante", () => {
    render(<DeliveryWrapper />);

    expect(screen.getByText("etapa-entrega")).toBeInTheDocument();
    expect(screen.getByText("Bear Burger")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("só passa para o pagamento com a entrega válida", async () => {
    const user = userEvent.setup();
    const isDeliveryValid = vi.fn(() => false);
    setCheckout({ isDeliveryValid });
    render(<DeliveryWrapper />);

    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(toast.error).toHaveBeenCalledWith(
      "Preencha nome, telefone e endereço para continuar.",
    );
    expect(screen.getByText("etapa-entrega")).toBeInTheDocument();

    isDeliveryValid.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(screen.getByText("etapa-pagamento total=42.5")).toBeInTheDocument();
  });

  it("retirada pede só nome e telefone", async () => {
    const user = userEvent.setup();
    setCheckout({ orderType: "pickup", isDeliveryValid: vi.fn(() => false) });
    render(<DeliveryWrapper />);

    await user.click(screen.getByRole("button", { name: "Continuar" }));

    expect(toast.error).toHaveBeenCalledWith(
      "Preencha nome e telefone para continuar.",
    );
  });

  it("confirmar com pagamento inválido não finaliza", async () => {
    const user = userEvent.setup();
    setCheckout({ isFormValid: vi.fn(() => false) });
    render(<DeliveryWrapper />);
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await user.click(screen.getByRole("button", { name: "Confirmar pedido" }));

    expect(toast.error).toHaveBeenCalledWith(
      "Verifique os dados de pagamento antes de confirmar.",
    );
    expect(checkout.handleSubmitOrder).not.toHaveBeenCalled();
  });

  it("confirmar com tudo válido finaliza o pedido", async () => {
    const user = userEvent.setup();
    render(<DeliveryWrapper />);
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await user.click(screen.getByRole("button", { name: "Confirmar pedido" }));

    expect(checkout.handleSubmitOrder).toHaveBeenCalledTimes(1);
  });

  it("quatro cliques seguidos em confirmar durante o envio disparam handleSubmitOrder apenas uma vez", async () => {
    const user = userEvent.setup();
    let releaseSubmit!: () => void;
    const handleSubmitOrder = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseSubmit = resolve;
        }),
    );
    setCheckout({ handleSubmitOrder });

    render(<DeliveryWrapper />);
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    const confirmButton = screen.getByRole("button", {
      name: "Confirmar pedido",
    });

    await user.click(confirmButton);
    await user.click(confirmButton);
    await user.click(confirmButton);
    await user.click(confirmButton);

    expect(handleSubmitOrder).toHaveBeenCalledTimes(1);

    await act(async () => {
      releaseSubmit();
    });
  });

  it("voltar no pagamento volta para a entrega; voltar na entrega vai para o carrinho", async () => {
    const user = userEvent.setup();
    render(<DeliveryWrapper />);
    await user.click(screen.getByRole("button", { name: "Continuar" }));

    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(screen.getByText("etapa-entrega")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(router.push).toHaveBeenCalledWith("/cart");
  });

  it("carrinho vazio volta para as lojas", () => {
    setCheckout({ cartItems: [] });

    render(<DeliveryWrapper />);

    expect(toast.error).toHaveBeenCalledWith("Seu carrinho esta vazio!");
    expect(router.push).toHaveBeenCalledWith("/#lojas");
  });

  it("finalizando o pedido, carrinho vazio não expulsa da tela", () => {
    // O carrinho esvazia ao finalizar; quem navega é o fluxo de sucesso.
    setCheckout({ cartItems: [], isNavigating: true });

    render(<DeliveryWrapper />);

    expect(router.push).not.toHaveBeenCalled();
  });

  it("itens sem restaurante sincronizam uma vez com o backend", async () => {
    setCheckout({ restaurant: null });
    let finish!: () => void;
    cart.syncCartFromBackend.mockReturnValue(
      new Promise<void>((resolve) => (finish = resolve)),
    );

    const { rerender } = render(<DeliveryWrapper />);

    expect(cart.syncCartFromBackend).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Carregando carrinho...")).toBeInTheDocument();
    // Mais itens chegando sem restaurante (404 no Redis) não disparam outro sync.
    checkout.cartItems = [{ id: "i1" }, { id: "i2" }];
    rerender(<DeliveryWrapper />);
    expect(cart.syncCartFromBackend).toHaveBeenCalledTimes(1);

    await act(async () => finish());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Erro ao carregar dados do restaurante. Adicione os itens novamente ao carrinho.",
      ),
    );
    expect(router.push).toHaveBeenCalledWith("/#lojas");
    expect(cart.syncCartFromBackend).toHaveBeenCalledTimes(1);
  });

  it("sem login, pede login e mostra a tela de login necessário", async () => {
    const user = userEvent.setup();
    auth.isAuthenticated = false;

    render(<DeliveryWrapper />);

    expect(auth.showAuthModal).toHaveBeenCalled();
    expect(screen.getByText("Login necessario")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Fazer login" }));
    expect(auth.showAuthModal).toHaveBeenCalledTimes(2);
    expect(cart.syncCartFromBackend).not.toHaveBeenCalled();
  });
});
