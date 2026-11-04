import { render, screen, within } from "@testing-library/react";
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

// A comanda sai em duas vias; estes testes olham a da cozinha, que é a que
// mostra tamanho, adicionais e observações por extenso.
function renderKitchenVia(order: KitchenOrder) {
  render(<KitchenPrintArea order={order} />);
  const section = screen.getByRole("region", { name: "Via da cozinha" });
  return { via: within(section), container: section };
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
    const { via } = renderKitchenVia(makeOrder([itemComTamanho]));

    expect(via.getByText("Tamanho: Tradicional (18 cm)")).toBeInTheDocument();
    expect(via.queryByText("Variação")).not.toBeInTheDocument();
    expect(via.queryByText(/Adiciona/)).not.toBeInTheDocument();
  });

  it("item sem tamanho e sem adicional não imprime nenhuma dessas linhas", () => {
    const { via, container } = renderKitchenVia(makeOrder([itemSemTamanho]));

    expect(via.getByText("2x Caldo de Cana")).toBeInTheDocument();
    expect(via.queryByText(/Tamanho/)).not.toBeInTheDocument();
    expect(via.queryByText(/Adiciona/)).not.toBeInTheDocument();
    expect(via.queryByText("Variação")).not.toBeInTheDocument();
    expect(container.querySelectorAll("p.pl-2")).toHaveLength(0);
  });

  it("variação sem nome não vira o genérico \"Variação\"", () => {
    const item: KitchenOrderItem = {
      ...itemComTamanho,
      variations: [{ id: "var-1", productVariation: null }],
    };
    const { via, container } = renderKitchenVia(makeOrder([item]));

    expect(via.queryByText("Variação")).not.toBeInTheDocument();
    expect(container.querySelectorAll("p.pl-2")).toHaveLength(0);
  });

  it("mantém a observação do tamanho junto ao nome", () => {
    const item: KitchenOrderItem = {
      ...itemComTamanho,
      variations: [
        { id: "var-1", observations: "bem fechado", productVariation: { name: "Tradicional (18 cm)" } },
      ],
    };
    const { via } = renderKitchenVia(makeOrder([item]));

    expect(via.getByText("Tamanho: Tradicional (18 cm) (bem fechado)")).toBeInTheDocument();
  });

  it("item só com adicional imprime \"Adicionais:\" e o nome real, sem linha de tamanho", () => {
    const item: KitchenOrderItem = { ...itemSemTamanho, quantity: 1, addOns: [adicional] };
    const { via } = renderKitchenVia(makeOrder([item]));

    expect(via.getByText("Adicionais:")).toBeInTheDocument();
    expect(via.getByText("+ Catupiry extra")).toBeInTheDocument();
    expect(via.queryByText("+ Adicional")).not.toBeInTheDocument();
    expect(via.queryByText(/Tamanho/)).not.toBeInTheDocument();
  });

  it("item com tamanho e adicional imprime os dois em linhas separadas", () => {
    const item: KitchenOrderItem = { ...itemComTamanho, addOns: [adicional] };
    const { via } = renderKitchenVia(makeOrder([item]));

    expect(via.getByText("Tamanho: Tradicional (18 cm)")).toBeInTheDocument();
    expect(via.getByText("Adicionais:")).toBeInTheDocument();
    expect(via.getByText("+ Catupiry extra")).toBeInTheDocument();
  });

  it("adicional sem nome não vira o genérico \"+ Adicional\"", () => {
    const item: KitchenOrderItem = {
      ...itemSemTamanho,
      addOns: [{ ...adicional, productAddOns: null }],
    };
    const { via } = renderKitchenVia(makeOrder([item]));

    expect(via.queryByText("+ Adicional")).not.toBeInTheDocument();
    expect(via.queryByText("Adicionais:")).not.toBeInTheDocument();
  });

  it("adicional com quantidade 1 imprime só o nome", () => {
    const item: KitchenOrderItem = { ...itemSemTamanho, quantity: 1, addOns: [{ ...adicional, quantity: 1 }] };
    const { via } = renderKitchenVia(makeOrder([item]));

    expect(via.getByText("+ Catupiry extra")).toBeInTheDocument();
    expect(via.queryByText(/1x Catupiry/)).not.toBeInTheDocument();
  });

  it("adicional com quantidade maior que 1 imprime \"4x Morango\"", () => {
    const item: KitchenOrderItem = {
      ...itemSemTamanho,
      quantity: 1,
      addOns: [{ ...adicional, id: "add-2", quantity: 4, productAddOns: { name: "Morango" } }],
    };
    const { via } = renderKitchenVia(makeOrder([item]));

    expect(via.getByText("+ 4x Morango")).toBeInTheDocument();
  });

  it("junta linhas idênticas e mantém separada a de tamanho diferente (pedido #6)", () => {
    const caldo = {
      productId: "caldo",
      product: { id: "caldo", name: "Caldo de Cana" },
      unitPrice: 6,
      addOns: [
        { id: "x", productAddOnsId: "limao", quantity: 4, priceSnapshot: 0.01, productAddOns: { name: "Com limão" } },
      ],
    };
    const v600 = [{ id: "v", productVariationId: "v600", priceSnapshot: 0, productVariation: { name: "600ml" } }];
    const v300 = [{ id: "w", productVariationId: "v300", priceSnapshot: 0, productVariation: { name: "300 ml" } }];
    const { via } = renderKitchenVia(
      makeOrder([
        { ...caldo, id: "a", quantity: 3, variations: v600 },
        { ...caldo, id: "b", quantity: 3, variations: v600 },
        { ...caldo, id: "c", quantity: 1, variations: v300 },
      ]),
    );

    expect(via.getByText("6x Caldo de Cana")).toBeInTheDocument();
    expect(via.getByText("1x Caldo de Cana")).toBeInTheDocument();
    expect(via.queryByText("3x Caldo de Cana")).not.toBeInTheDocument();
    expect(via.getByText("Tamanho: 600ml")).toBeInTheDocument();
    expect(via.getByText("Tamanho: 300 ml")).toBeInTheDocument();
  });

  describe("adicionais por unidade", () => {
    const limao = { id: "l", quantity: 4, productAddOns: { name: "Com limão" } };
    const gelo = { id: "g", quantity: 1, productAddOns: { name: "Gelo" } };

    it("prato com 1 unidade mantém \"Adicionais:\" sem total", () => {
      const { via } = renderKitchenVia(makeOrder([{ ...itemSemTamanho, quantity: 1, addOns: [limao, gelo] }]));

      expect(via.getByText("Adicionais:")).toBeInTheDocument();
      expect(via.getByText("+ 4x Com limão")).toBeInTheDocument();
      expect(via.getByText("+ Gelo")).toBeInTheDocument();
      expect(via.queryByText(/no total/)).not.toBeInTheDocument();
    });

    it("prato com mais de 1 unidade usa \"em cada um\" e mostra o total", () => {
      const { via } = renderKitchenVia(makeOrder([{ ...itemSemTamanho, quantity: 6, addOns: [limao, gelo] }]));

      expect(via.getByText("Adicionais, em cada um:")).toBeInTheDocument();
      expect(via.getByText("+ 4x Com limão (24 no total)")).toBeInTheDocument();
      expect(via.getByText("+ Gelo (6 no total)")).toBeInTheDocument();
    });
  });
});
