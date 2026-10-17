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

// O nome do adicional vem em `productAddOns.name`.
const adicional = {
  id: "add-1",
  quantity: 1,
  priceSnapshot: 2,
  observations: null,
  productAddOns: { name: "Catupiry extra" },
};

const itemSemTamanho: KitchenOrderItem = {
  id: "item-2",
  productId: "p2",
  quantity: 2,
  product: { id: "p2", name: "Caldo de Cana" },
  addOns: [],
  variations: [],
};

describe("KitchenPrintArea - tamanho e adicionais na comanda", () => {
  it("item com tamanho imprime o nome do tamanho escolhido", () => {
    render(<KitchenPrintArea order={makeOrder([itemComTamanho])} />);

    expect(screen.getByText("Tamanho: Tradicional (18 cm)")).toBeInTheDocument();
    expect(screen.queryByText("Variação")).not.toBeInTheDocument();
    expect(screen.queryByText(/Adiciona/)).not.toBeInTheDocument();
  });

  it("item sem tamanho e sem adicional não imprime nenhuma dessas linhas", () => {
    const { container } = render(<KitchenPrintArea order={makeOrder([itemSemTamanho])} />);

    expect(screen.getByText("2x Caldo de Cana")).toBeInTheDocument();
    expect(screen.queryByText(/Tamanho/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Adiciona/)).not.toBeInTheDocument();
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

    expect(screen.getByText("Tamanho: Tradicional (18 cm) (bem fechado)")).toBeInTheDocument();
  });

  it("item só com adicional imprime \"Adicionais:\" e o nome real, sem linha de tamanho", () => {
    const item: KitchenOrderItem = { ...itemSemTamanho, addOns: [adicional] };
    render(<KitchenPrintArea order={makeOrder([item])} />);

    expect(screen.getByText("Adicionais:")).toBeInTheDocument();
    expect(screen.getByText("+ Catupiry extra")).toBeInTheDocument();
    expect(screen.queryByText("+ Adicional")).not.toBeInTheDocument();
    expect(screen.queryByText(/Tamanho/)).not.toBeInTheDocument();
  });

  it("item com tamanho e adicional imprime os dois em linhas separadas", () => {
    const item: KitchenOrderItem = { ...itemComTamanho, addOns: [adicional] };
    render(<KitchenPrintArea order={makeOrder([item])} />);

    expect(screen.getByText("Tamanho: Tradicional (18 cm)")).toBeInTheDocument();
    expect(screen.getByText("Adicionais:")).toBeInTheDocument();
    expect(screen.getByText("+ Catupiry extra")).toBeInTheDocument();
  });

  it("adicional sem nome não vira o genérico \"+ Adicional\"", () => {
    const item: KitchenOrderItem = {
      ...itemSemTamanho,
      addOns: [{ ...adicional, productAddOns: null }],
    };
    render(<KitchenPrintArea order={makeOrder([item])} />);

    expect(screen.queryByText("+ Adicional")).not.toBeInTheDocument();
    expect(screen.queryByText("Adicionais:")).not.toBeInTheDocument();
  });
});
