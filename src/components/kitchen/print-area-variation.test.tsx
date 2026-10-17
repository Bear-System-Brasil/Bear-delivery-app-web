import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KitchenPrintArea } from "./index";
import type { KitchenOrder, KitchenOrderItem } from "./types";

function makeOrder(orderedItems: KitchenOrderItem[]): KitchenOrder {
  return {
    id: "order-1",
    orderNumber: 7,
    status: "ORDERED",
    created_at: new Date().toISOString(),
    statusChangedAt: new Date().toISOString(),
    fulfillmentType: "PICKUP",
    customer: { id: "c1", name: "Cliente Teste" },
    orderedItems,
  };
}

// Forma observada em GET /order/company/status/:status: o tamanho vem em
// `productVariation.name`, sem `description`.
const itemComTamanho: KitchenOrderItem = {
  id: "item-1",
  productId: "p1",
  quantity: 1,
  product: { id: "p1", name: "Pastel de Queijo" },
  addOns: [],
  variations: [
    {
      id: "var-1",
      priceSnapshot: 0,
      observations: null,
      productVariation: { name: "Tradicional (18 cm)" },
    },
  ],
};

const itemSemTamanho: KitchenOrderItem = {
  id: "item-2",
  productId: "p2",
  quantity: 2,
  product: { id: "p2", name: "Caldo de Cana" },
  addOns: [],
  variations: [],
};

describe("KitchenPrintArea - tamanho na comanda", () => {
  it("item com tamanho imprime o nome do tamanho escolhido", () => {
    render(<KitchenPrintArea order={makeOrder([itemComTamanho])} />);

    expect(screen.getByText("Tradicional (18 cm)")).toBeInTheDocument();
    expect(screen.queryByText("Variação")).not.toBeInTheDocument();
  });

  it("item sem tamanho não imprime nada no lugar", () => {
    const { container } = render(<KitchenPrintArea order={makeOrder([itemSemTamanho])} />);

    expect(screen.getByText("2x Caldo de Cana")).toBeInTheDocument();
    expect(screen.queryByText("Variação")).not.toBeInTheDocument();
    expect(container.querySelectorAll("p.pl-2")).toHaveLength(0);
  });

  it("variação sem nome não vira o genérico \"Variação\"", () => {
    const item: KitchenOrderItem = {
      ...itemComTamanho,
      variations: [{ id: "var-1", productVariation: null }],
    };
    const { container } = render(<KitchenPrintArea order={makeOrder([item])} />);

    expect(screen.queryByText("Variação")).not.toBeInTheDocument();
    expect(container.querySelectorAll("p.pl-2")).toHaveLength(0);
  });

  it("mantém a observação do tamanho junto ao nome", () => {
    const item: KitchenOrderItem = {
      ...itemComTamanho,
      variations: [
        { id: "var-1", observations: "bem fechado", productVariation: { name: "Tradicional (18 cm)" } },
      ],
    };
    render(<KitchenPrintArea order={makeOrder([item])} />);

    expect(screen.getByText("Tradicional (18 cm) (bem fechado)")).toBeInTheDocument();
  });
});
