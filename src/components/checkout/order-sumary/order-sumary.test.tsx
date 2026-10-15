import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrderSummary } from "./index";

const normalize = (value: string | null) => (value ?? "").replace(/\u00a0/g, " ");

const CART_ITEMS = [
  {
    id: "line-1",
    productId: "p1",
    name: "Combo Executivo",
    price: 120,
    quantity: 1,
    restaurantId: "r1",
    restaurantName: "DeCasa",
  },
];

describe("OrderSummary", () => {
  it("mostra o frete e o total com frete incluído quando conhecido", () => {
    render(
      <OrderSummary
        handleSubmitOrder={vi.fn(async () => {})}
        cartItems={CART_ITEMS}
        subtotal={120}
        deliveryFee={5}
        isDeliveryFeeKnown={true}
        total={125}
        isProcessing={false}
        step={2}
        detailsOpen={true}
        onToggleDetails={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(normalize(screen.getByText(/R\$\s*5,00/).textContent)).toBe(
      "R$ 5,00",
    );
    expect(
      normalize(screen.getByRole("button", { name: /Pagar/ }).textContent),
    ).toBe("Pagar R$ 125,00");
    expect(screen.queryByText(/Grátis|Gratis/i)).not.toBeInTheDocument();
  });

  it("avisa que o frete é calculado na finalização em vez de mostrar Grátis quando o valor ainda não é conhecido", () => {
    render(
      <OrderSummary
        handleSubmitOrder={vi.fn(async () => {})}
        cartItems={CART_ITEMS}
        subtotal={120}
        deliveryFee={0}
        isDeliveryFeeKnown={false}
        total={120}
        isProcessing={false}
        step={1}
        detailsOpen={true}
        onToggleDetails={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.getByText("Calculado na finalização")).toBeInTheDocument();
    expect(screen.getByText(/\+ frete na finalização/)).toBeInTheDocument();
    expect(screen.queryByText(/Grátis|Gratis/i)).not.toBeInTheDocument();
  });

  it("mostra Grátis apenas quando o frete é conhecido e igual a zero (ex.: retirada)", () => {
    render(
      <OrderSummary
        handleSubmitOrder={vi.fn(async () => {})}
        cartItems={CART_ITEMS}
        subtotal={120}
        deliveryFee={0}
        isDeliveryFeeKnown={true}
        total={120}
        isProcessing={false}
        step={1}
        detailsOpen={true}
        onToggleDetails={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(screen.getByText("Grátis")).toBeInTheDocument();
  });

  it("desabilita o botão e exibe aviso quando o restaurante está fechado", () => {
    render(
      <OrderSummary
        handleSubmitOrder={vi.fn(async () => {})}
        cartItems={CART_ITEMS}
        subtotal={120}
        deliveryFee={5}
        isDeliveryFeeKnown={true}
        total={125}
        isProcessing={false}
        isRestaurantOpen={false}
        closedReason="Restaurante fechado no momento. Abre amanhã às 18:00."
        step={2}
        detailsOpen={false}
        onToggleDetails={vi.fn()}
        onContinue={vi.fn()}
      />,
    );

    expect(
      screen.getByText("Restaurante fechado no momento. Abre amanhã às 18:00."),
    ).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Restaurante fechado" });
    expect(btn).toBeDisabled();
  });
});

