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

  it("adicional com quantidade 1 mostra só o nome", () => {
    render(<OrderDetailSheet order={makeOrder({ ...baseItem, addOns: [adicional] })} open onClose={onClose} />);

    expect(screen.getByText("+ Catupiry extra")).toBeInTheDocument();
    expect(screen.queryByText(/1x Catupiry/)).not.toBeInTheDocument();
  });

  it("adicional com quantidade maior que 1 mostra \"4x Morango\"", () => {
    const morango = { productAddOns: { name: "Morango" }, quantity: 4, priceSnapshot: 1 };
    render(<OrderDetailSheet order={makeOrder({ ...baseItem, addOns: [morango] })} open onClose={onClose} />);

    expect(screen.getByText("+ 4x Morango")).toBeInTheDocument();
  });

  it("o contador soma as unidades, não as linhas (3 + 3 + 1 = 7 itens)", () => {
    const order: DetailableOrder = {
      ...makeOrder(baseItem),
      orderedItems: [
        { ...baseItem, id: "a", quantity: 3, variations: [tamanho] },
        { ...baseItem, id: "b", quantity: 3, variations: [tamanho] },
        { ...baseItem, id: "c", quantity: 1 },
      ],
    };
    render(<OrderDetailSheet order={order} open onClose={onClose} />);

    expect(screen.getByText("7 itens do pedido")).toBeInTheDocument();
  });

  it("uma unidade usa o singular", () => {
    render(<OrderDetailSheet order={makeOrder(baseItem)} open onClose={onClose} />);

    expect(screen.getByText("1 item do pedido")).toBeInTheDocument();
  });

  it("junta linhas idênticas e mantém separada a de tamanho diferente (pedido #6)", () => {
    const limao = { productAddOnsId: "limao", productAddOns: { name: "Com limão" }, quantity: 4, priceSnapshot: 0.01 };
    const v600 = { productVariationId: "v600", productVariation: { name: "600ml" }, priceSnapshot: 0 };
    const v300 = { productVariationId: "v300", productVariation: { name: "300 ml" }, priceSnapshot: 0 };
    const caldo = { ...baseItem, productId: "caldo", product: { name: "Caldo de Cana" }, unitPrice: 6 };
    const order: DetailableOrder = {
      ...makeOrder(baseItem),
      orderedItems: [
        { ...caldo, id: "a", quantity: 3, variations: [v600], addOns: [limao] },
        { ...caldo, id: "b", quantity: 3, variations: [v600], addOns: [limao] },
        { ...caldo, id: "c", quantity: 1, variations: [v300], addOns: [limao] },
      ],
    };
    render(<OrderDetailSheet order={order} open onClose={onClose} />);

    expect(screen.getByText("7 itens do pedido")).toBeInTheDocument();
    expect(screen.getByText("6x Caldo de Cana")).toBeInTheDocument();
    expect(screen.getByText("1x Caldo de Cana")).toBeInTheDocument();
    expect(screen.queryByText("3x Caldo de Cana")).not.toBeInTheDocument();
    // 6 x (6,00 + 4 x 0,01) = 36,24
    expect(screen.getByText(/36,24/)).toBeInTheDocument();
  });

  describe("adicionais por unidade", () => {
    const limao = { productAddOns: { name: "Com limão" }, quantity: 4, priceSnapshot: 0.01 };
    const gelo = { productAddOns: { name: "Gelo" }, quantity: 1, priceSnapshot: 0 };

    it("prato com 1 unidade mantém \"Adicionais:\" sem total", () => {
      render(
        <OrderDetailSheet order={makeOrder({ ...baseItem, quantity: 1, addOns: [limao, gelo] })} open onClose={onClose} />,
      );

      expect(screen.getByText("Adicionais:")).toBeInTheDocument();
      expect(screen.getByText("+ 4x Com limão")).toBeInTheDocument();
      expect(screen.getByText("+ Gelo")).toBeInTheDocument();
      expect(screen.queryByText(/no total/)).not.toBeInTheDocument();
    });

    it("prato com mais de 1 unidade usa \"em cada um\" e mostra o total", () => {
      render(
        <OrderDetailSheet order={makeOrder({ ...baseItem, quantity: 6, addOns: [limao, gelo] })} open onClose={onClose} />,
      );

      expect(screen.getByText("Adicionais, em cada um:")).toBeInTheDocument();
      expect(screen.getByText("+ 4x Com limão (24 no total)")).toBeInTheDocument();
      expect(screen.getByText("+ Gelo (6 no total)")).toBeInTheDocument();
    });
  });
});
