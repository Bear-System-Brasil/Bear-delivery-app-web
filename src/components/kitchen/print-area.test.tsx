import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KitchenPrintArea } from "./index";
import type { KitchenOrder } from "./types";

function makeOrder(
  paymentMethod: string,
  changeFor?: string | null,
): KitchenOrder {
  return {
    id: "order-1",
    orderNumber: 2,
    status: "ORDERED",
    created_at: new Date().toISOString(),
    statusChangedAt: new Date().toISOString(),
    fulfillmentType: "DELIVERY",
    totalValue: 14,
    customer: { id: "c1", name: "Cliente Teste" },
    orderedItems: [],
    payments: [{ id: "p1", paymentMethod, status: "PENDING", amount: 14 }],
    changeFor,
  } as KitchenOrder;
}

describe("KitchenPrintArea - troco na comanda", () => {
  it("pedido em dinheiro com troco imprime quanto o cliente paga e o troco", () => {
    render(<KitchenPrintArea order={makeOrder("CASH", "151")} />);

    expect(screen.getByText("Pagamento: Dinheiro")).toBeInTheDocument();
    expect(screen.getByText(/Cliente paga com R\$\s*151,00/)).toBeInTheDocument();
    expect(screen.getByText(/Levar R\$\s*137,00 de troco/)).toBeInTheDocument();
  });

  it("pedido em dinheiro sem troco não imprime troco", () => {
    render(<KitchenPrintArea order={makeOrder("CASH")} />);

    expect(screen.queryByText(/Cliente paga com/)).not.toBeInTheDocument();
    expect(screen.queryByText(/de troco/)).not.toBeInTheDocument();
  });

  it("pagamento que não é dinheiro não imprime troco", () => {
    render(<KitchenPrintArea order={makeOrder("PIX", "151")} />);

    expect(screen.queryByText(/Cliente paga com/)).not.toBeInTheDocument();
    expect(screen.queryByText(/de troco/)).not.toBeInTheDocument();
  });
});
