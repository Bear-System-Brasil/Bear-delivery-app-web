import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KitchenOrderCard } from "./order-card";
import type { KitchenOrder, KitchenOrderItem } from "./types";

// Referências estáveis: mock com identidade nova a cada render já causou
// laço infinito nos testes deste projeto.
const noop = vi.fn();

function makeOrder(item: KitchenOrderItem): KitchenOrder {
  return {
    id: "order-1",
    orderNumber: 8,
    status: "ORDERED",
    created_at: new Date().toISOString(),
    statusChangedAt: new Date().toISOString(),
    fulfillmentType: "PICKUP",
    customer: { id: "c1", name: "Cliente Teste" },
    orderedItems: [item],
  };
}

function renderCard(item: KitchenOrderItem) {
  return render(
    <KitchenOrderCard
      order={makeOrder(item)}
      actionLabel="Iniciar preparo"
      onAdvance={noop}
      onPrint={noop}
      onViewDetails={noop}
    />,
  );
}

const baseItem: KitchenOrderItem = {
  id: "item-1",
  productId: "p1",
  quantity: 1,
  product: { id: "p1", name: "Pastel de Queijo" },
  addOns: [],
  variations: [],
};

const tamanho = { id: "var-1", productVariation: { name: "Tradicional (18 cm)" } };

describe("KitchenOrderCard - tamanho e adicional separados", () => {
  it("item só com tamanho mostra o tamanho e não vira \"Com adicional\"", () => {
    renderCard({ ...baseItem, variations: [tamanho] });

    expect(screen.getByText("Tamanho: Tradicional (18 cm)")).toBeInTheDocument();
    expect(screen.getByText("Sem adicional")).toBeInTheDocument();
    expect(screen.queryByText("Com adicional")).not.toBeInTheDocument();
  });

  it("item sem tamanho e sem adicional não mostra linha de tamanho", () => {
    renderCard(baseItem);

    expect(screen.queryByText(/Tamanho/)).not.toBeInTheDocument();
    expect(screen.getByText("Sem adicional")).toBeInTheDocument();
  });
});
