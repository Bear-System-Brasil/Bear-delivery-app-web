import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KitchenOrderCard } from "./order-card";
import type { KitchenOrder } from "./types";

// Formato observado em GET /order/company/status/:status: `changeFor` vem
// como texto e o pagamento traz método, status e valor.
function makeOrder(
  paymentMethod: string,
  changeFor?: string | null,
): KitchenOrder {
  return {
    id: "order-1",
    orderNumber: 1,
    status: "ORDERED",
    created_at: new Date().toISOString(),
    statusChangedAt: new Date().toISOString(),
    fulfillmentType: "PICKUP",
    totalValue: 9,
    customer: { id: "c1", name: "Cliente Teste" },
    orderedItems: [],
    payments: [{ id: "p1", paymentMethod, status: "PENDING", amount: 9 }],
    changeFor,
  } as KitchenOrder;
}

function renderCard(order: KitchenOrder) {
  render(
    <KitchenOrderCard
      order={order}
      actionLabel="Iniciar preparo"
      onAdvance={vi.fn()}
      onPrint={vi.fn()}
      onViewDetails={vi.fn()}
    />,
  );
}

describe("KitchenOrderCard - troco", () => {
  it("pedido em dinheiro com troco mostra quanto o cliente paga e o troco", () => {
    renderCard(makeOrder("CASH", "137"));

    expect(screen.getByText(/Cliente paga com R\$\s*137,00/)).toBeInTheDocument();
    expect(screen.getByText(/Levar R\$\s*128,00 de troco/)).toBeInTheDocument();
  });

  it("pedido em dinheiro sem troco não mostra troco", () => {
    renderCard(makeOrder("CASH", null));

    expect(screen.getByText("Dinheiro")).toBeInTheDocument();
    expect(screen.queryByText(/Cliente paga com/)).not.toBeInTheDocument();
    expect(screen.queryByText(/de troco/)).not.toBeInTheDocument();
  });

  it("pagamento que não é dinheiro não mostra troco", () => {
    renderCard(makeOrder("CREDIT_CARD", "137"));

    expect(screen.queryByText(/Cliente paga com/)).not.toBeInTheDocument();
    expect(screen.queryByText(/de troco/)).not.toBeInTheDocument();
  });
});
