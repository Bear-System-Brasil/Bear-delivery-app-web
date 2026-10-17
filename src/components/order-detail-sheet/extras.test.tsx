import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrderDetailSheet, type DetailableOrder } from "./index";

const onClose = vi.fn();

type DetailItem = NonNullable<DetailableOrder["orderedItems"]>[number];

function makeOrder(item: DetailItem): DetailableOrder {
  return {
    id: "order-1",
    orderNumber: 8,
    status: "ORDERED",
    created_at: new Date().toISOString(),
    customer: { name: "Cliente Teste" },
    orderedItems: [item],
  };
}

const baseItem: DetailItem = {
  id: "item-1",
  productId: "p1",
  quantity: 1,
  unitPrice: 9,
  product: { name: "Pastel de Queijo" },
  addOns: [],
  variations: [],
};

// Forma observada em GET /order/company/status/:status.
const adicional = { productAddOns: { name: "Catupiry extra" }, quantity: 1, priceSnapshot: 2 };
const tamanho = { productVariation: { name: "Tradicional (18 cm)" }, priceSnapshot: 0 };

describe("OrderDetailSheet - tamanho e adicional separados", () => {
  it("item só com tamanho mostra a linha com rótulo \"Tamanho:\"", () => {
    render(<OrderDetailSheet order={makeOrder({ ...baseItem, variations: [tamanho] })} open onClose={onClose} />);

    expect(screen.getByText("Tamanho: Tradicional (18 cm)")).toBeInTheDocument();
  });

  it("item sem tamanho e sem adicional não mostra nenhuma dessas linhas", () => {
    render(<OrderDetailSheet order={makeOrder(baseItem)} open onClose={onClose} />);

    expect(screen.queryByText(/Tamanho/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Adiciona/)).not.toBeInTheDocument();
  });

  it("item só com adicional mostra \"Adicionais:\" e o nome real, sem linha de tamanho", () => {
    render(<OrderDetailSheet order={makeOrder({ ...baseItem, addOns: [adicional] })} open onClose={onClose} />);

    expect(screen.getByText("Adicionais:")).toBeInTheDocument();
    expect(screen.getByText("+ Catupiry extra")).toBeInTheDocument();
    expect(screen.queryByText(/Tamanho/)).not.toBeInTheDocument();
  });

  it("item com tamanho e adicional mostra os dois separados, com rótulo", () => {
    render(
      <OrderDetailSheet
        order={makeOrder({ ...baseItem, variations: [tamanho], addOns: [adicional] })}
        open
        onClose={onClose}
      />,
    );

    expect(screen.getByText("Tamanho: Tradicional (18 cm)")).toBeInTheDocument();
    expect(screen.getByText("Adicionais:")).toBeInTheDocument();
    expect(screen.getByText("+ Catupiry extra")).toBeInTheDocument();
  });
});
