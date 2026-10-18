import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrderDetailSheet } from "./index";

// Mesmo formato do pedido da cozinha: `changeFor` como texto.
function makeOrder(paymentMethod: string, changeFor?: string | null) {
  return {
    id: "order-1",
    orderNumber: 1,
    status: "ORDERED",
    created_at: new Date().toISOString(),
    fulfillmentType: "PICKUP",
    totalValue: 9,
    customer: { name: "Cliente Teste" },
    orderedItems: [],
    payments: [{ paymentMethod, status: "PENDING", amount: 9 }],
    changeFor,
  };
}

function renderSheet(order: ReturnType<typeof makeOrder>) {
  render(<OrderDetailSheet order={order} open onClose={vi.fn()} />);
}

describe("OrderDetailSheet - troco", () => {
  it("pedido em dinheiro com troco mostra quanto o cliente paga e o troco", () => {
    renderSheet(makeOrder("CASH", "137"));

    expect(screen.getByText(/Cliente paga com R\$\s*137,00/)).toBeInTheDocument();
    expect(screen.getByText(/Separar R\$\s*128,00 de troco/)).toBeInTheDocument();
  });

  it("pedido em dinheiro sem troco não mostra troco", () => {
    renderSheet(makeOrder("CASH", null));

    expect(screen.getByText("Dinheiro")).toBeInTheDocument();
    expect(screen.queryByText(/Cliente paga com/)).not.toBeInTheDocument();
    expect(screen.queryByText(/de troco/)).not.toBeInTheDocument();
  });

  it("pagamento que não é dinheiro não mostra troco", () => {
    renderSheet(makeOrder("DEBIT_CARD", "137"));

    expect(screen.queryByText(/Cliente paga com/)).not.toBeInTheDocument();
    expect(screen.queryByText(/de troco/)).not.toBeInTheDocument();
  });
});
