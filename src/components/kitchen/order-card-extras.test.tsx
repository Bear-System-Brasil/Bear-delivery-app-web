import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KitchenOrderCard } from "./order-card";
import type { KitchenOrder, KitchenOrderItem } from "./types";

// Referências estáveis: mock com identidade nova a cada render já causou
// laço infinito nos testes deste projeto.
const noop = vi.fn();

function makeOrder(items: KitchenOrderItem[]): KitchenOrder {
  return {
    id: "order-1",
    orderNumber: 8,
    status: "ORDERED",
    created_at: new Date().toISOString(),
    statusChangedAt: new Date().toISOString(),
    fulfillmentType: "PICKUP",
    customer: { id: "c1", name: "Cliente Teste" },
    orderedItems: items,
  };
}

function renderCard(...items: KitchenOrderItem[]) {
  return render(
    <KitchenOrderCard
      order={makeOrder(items)}
      actionLabel="Iniciar preparo"
      onAdvance={noop}
      onPrint={noop}
      onViewDetails={noop}
    />,
  );
}

function item(id: string, overrides: Partial<KitchenOrderItem> = {}): KitchenOrderItem {
  return {
    id,
    productId: `p-${id}`,
    quantity: 1,
    product: { id: `p-${id}`, name: `Pastel ${id}` },
    addOns: [],
    variations: [],
    ...overrides,
  };
}

const adicional = { id: "add-1", quantity: 4, productAddOns: { name: "Morango" } };
const tamanho = { id: "var-1", productVariation: { name: "Tradicional (18 cm)" } };

/** Texto do botão de detalhes, onde fica o indicador geral do pedido. */
function indicador() {
  return screen.getByRole("button", { name: "Ver detalhes do pedido 8" }).textContent;
}

describe("KitchenOrderCard - indicador geral de tamanho e adicional", () => {
  it("pedido só com tamanho mostra \"Com tamanho\", sem nome do tamanho", () => {
    renderCard(item("a", { variations: [tamanho] }));

    expect(indicador()).toBe("Com tamanho");
    expect(screen.queryByText(/Tradicional/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Com adicional/)).not.toBeInTheDocument();
  });

  it("pedido só com adicional mostra \"Com adicional\", sem nome nem quantidade", () => {
    renderCard(item("a", { addOns: [adicional] }));

    expect(indicador()).toBe("Com adicional");
    expect(screen.queryByText(/Morango/)).not.toBeInTheDocument();
    expect(screen.queryByText(/4x/)).not.toBeInTheDocument();
  });

  it("pedido com tamanho e adicional mostra os dois indicadores", () => {
    renderCard(item("a", { variations: [tamanho], addOns: [adicional] }));

    expect(indicador()).toBe("Com tamanho · Com adicional");
  });

  it("pedido sem tamanho e sem adicional mantém \"Sem adicional\"", () => {
    renderCard(item("a"));

    expect(indicador()).toBe("Sem adicional");
    expect(screen.queryByText(/Com tamanho/)).not.toBeInTheDocument();
  });

  it("pedido com vários itens com tamanho mostra o indicador uma vez só, sem linha por item", () => {
    renderCard(
      item("a", { variations: [tamanho] }),
      item("b", { variations: [{ id: "var-2", productVariation: { name: "Gigante (30 cm)" } }] }),
      item("c", { variations: [tamanho], addOns: [adicional] }),
      item("d"),
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getAllByText(/Com tamanho/)).toHaveLength(1);
    expect(screen.getAllByText(/Com adicional/)).toHaveLength(1);
    expect(screen.queryByText(/Tamanho:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Tradicional|Gigante/)).not.toBeInTheDocument();
    for (const name of ["Pastel a", "Pastel b", "Pastel c", "Pastel d"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("linhas do mesmo prato viram uma só, com a quantidade somada (3 + 3 + 1 = 7)", () => {
    const caldo = { id: "caldo", name: "Caldo de Cana" };
    renderCard(
      item("a", { productId: "caldo", product: caldo, quantity: 3, variations: [tamanho] }),
      item("b", { productId: "caldo", product: caldo, quantity: 3, variations: [tamanho] }),
      item("c", {
        productId: "caldo",
        product: caldo,
        quantity: 1,
        variations: [{ id: "var-2", productVariation: { name: "300 ml" } }],
      }),
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("listitem")).toHaveTextContent("7× Caldo de Cana");
  });
});
