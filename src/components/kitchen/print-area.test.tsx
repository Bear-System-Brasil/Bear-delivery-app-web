import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KitchenPrintArea } from "./index";
import type { KitchenOrder, KitchenOrderItem } from "./types";

const pizza: KitchenOrderItem = {
  id: "item-1",
  productId: "pizza",
  quantity: 2,
  unitPrice: 30,
  product: { id: "pizza", name: "Pizza Calabresa" },
  variations: [
    { id: "v1", productVariationId: "media", priceSnapshot: 5, productVariation: { name: "Média" } },
  ],
  addOns: [
    { id: "a1", productAddOnsId: "borda", quantity: 2, priceSnapshot: 2, productAddOns: { name: "Borda catupiry" } },
  ],
};

const endereco = {
  id: "addr-1",
  street: "Rua das Flores",
  number: "123",
  complement: "Ap 4",
  reference: "portão azul",
  neighborhood: "Centro",
  city: "Campinas",
  state: "SP",
  zipCode: "13000-000",
};

function makeOrder(overrides: Partial<KitchenOrder> = {}): KitchenOrder {
  return {
    id: "order-1",
    orderNumber: 2,
    status: "ORDERED",
    created_at: new Date().toISOString(),
    statusChangedAt: new Date().toISOString(),
    fulfillmentType: "DELIVERY",
    totalValue: 86,
    totalShipping: 8,
    discount: 0,
    customer: { id: "c1", name: "Cliente Teste", phone: "+5511987654321" },
    orderedItems: [pizza],
    payments: [{ id: "p1", paymentMethod: "CASH", status: "PENDING", amount: 86 }],
    delivery: { id: "d1", status: "PENDING", deliveryAddress: endereco, observations: "deixar na portaria" },
    ...overrides,
  };
}

function renderVias(order: KitchenOrder, restaurantName?: string | null) {
  render(<KitchenPrintArea order={order} restaurantName={restaurantName} />);
  const kitchen = screen.getByRole("region", { name: "Via da cozinha" });
  const cashier = screen.getByRole("region", { name: /Via d(a entrega|o balcão)/ });
  return { kitchen, cashier, cozinha: within(kitchen), caixa: within(cashier) };
}

describe("KitchenPrintArea - duas vias", () => {
  it("imprime a via da cozinha e a da entrega, a segunda em página nova", () => {
    const { caixa, cashier, cozinha } = renderVias(makeOrder());

    expect(cozinha.getByText("COZINHA")).toBeInTheDocument();
    expect(caixa.getByText("ENTREGA")).toBeInTheDocument();
    expect(cashier).toHaveClass("break-before-page");
  });

  it("separa a comanda em blocos com título", () => {
    const { cozinha, caixa } = renderVias(makeOrder({ observations: "capricha" }));

    expect(cozinha.getByText("=== ITENS ===")).toBeInTheDocument();
    expect(cozinha.getByText("=== OBSERVAÇÕES ===")).toBeInTheDocument();
    expect(caixa.getByText("=== ENDEREÇO ===")).toBeInTheDocument();
    expect(caixa.getByText("=== ITENS ===")).toBeInTheDocument();
    expect(caixa.getByText("=== VALORES ===")).toBeInTheDocument();
    expect(caixa.getByText("=== PAGAMENTO ===")).toBeInTheDocument();
  });

  it("mostra o nome da loja nas duas vias", () => {
    const { cozinha, caixa } = renderVias(makeOrder(), "Pizzaria Teste");

    expect(cozinha.getByText("Pizzaria Teste")).toBeInTheDocument();
    expect(caixa.getByText("Pizzaria Teste")).toBeInTheDocument();
  });

  it("a via da cozinha não tem preço, telefone, endereço nem pagamento", () => {
    const { kitchen, cozinha } = renderVias(makeOrder({ changeFor: "100" }));

    expect(kitchen).not.toHaveTextContent(/R\$/);
    expect(cozinha.queryByText(/Tel:/)).not.toBeInTheDocument();
    expect(cozinha.queryByText(/Rua das Flores/)).not.toBeInTheDocument();
    expect(cozinha.queryByText(/de troco/)).not.toBeInTheDocument();
    // A observação da entrega continua na cozinha, como antes.
    expect(cozinha.getByText("ENTREGA: deixar na portaria")).toBeInTheDocument();
  });
});

describe("KitchenPrintArea - via da entrega", () => {
  it("imprime telefone e endereço completo com referência e observação", () => {
    const { caixa } = renderVias(makeOrder());

    expect(caixa.getByText("Tel: (11) 98765-4321")).toBeInTheDocument();
    expect(caixa.getByText("Rua das Flores, 123")).toBeInTheDocument();
    expect(caixa.getByText("Ap 4")).toBeInTheDocument();
    expect(caixa.getByText("Centro · Campinas · SP")).toBeInTheDocument();
    expect(caixa.getByText("13000-000")).toBeInTheDocument();
    expect(caixa.getByText("Ref.: portão azul")).toBeInTheDocument();
    expect(caixa.getByText("Obs.: deixar na portaria")).toBeInTheDocument();
  });

  it("sem telefone não imprime a linha", () => {
    const { caixa } = renderVias(makeOrder({ customer: { id: "c1", name: "Cliente Teste" } }));

    expect(caixa.queryByText(/Tel:/)).not.toBeInTheDocument();
  });

  it("entrega sem endereço avisa em vez de sumir com o bloco", () => {
    const { caixa } = renderVias(makeOrder({ delivery: null }));

    expect(caixa.getByText("Endereço não informado")).toBeInTheDocument();
  });

  it("imprime o valor de cada linha somando tamanho e adicionais", () => {
    const { caixa } = renderVias(makeOrder());

    // 2 x (30 + 5 de tamanho + 2 x 2 de borda) = 78
    const row = caixa.getByText("2x Pizza Calabresa").closest("p");
    expect(row).toHaveTextContent(/R\$\s*78,00/);
    expect(caixa.getByText("Média")).toBeInTheDocument();
    expect(caixa.getByText("+ 2x Borda catupiry (4 no total)")).toBeInTheDocument();
  });

  it("item sem preço não imprime valor zerado", () => {
    const { caixa } = renderVias(
      makeOrder({ orderedItems: [{ ...pizza, unitPrice: undefined }] }),
    );

    const row = caixa.getByText("2x Pizza Calabresa").closest("p");
    expect(row).not.toHaveTextContent(/R\$/);
  });

  it("imprime subtotal, taxa de entrega e total", () => {
    const { caixa } = renderVias(makeOrder());

    expect(caixa.getByText("Subtotal").closest("p")).toHaveTextContent(/R\$\s*78,00/);
    expect(caixa.getByText("Taxa de entrega").closest("p")).toHaveTextContent(/R\$\s*8,00/);
    expect(caixa.getByText("TOTAL").closest("p")).toHaveTextContent(/R\$\s*86,00/);
    expect(caixa.queryByText("Desconto")).not.toBeInTheDocument();
  });

  it("desconto aparece só quando é maior que zero", () => {
    const { caixa } = renderVias(makeOrder({ discount: 5, totalValue: 81 }));

    expect(caixa.getByText("Desconto").closest("p")).toHaveTextContent(/- R\$\s*5,00/);
    expect(caixa.getByText("Subtotal").closest("p")).toHaveTextContent(/R\$\s*78,00/);
  });

  it("sem total não imprime o bloco de valores", () => {
    const { caixa } = renderVias(makeOrder({ totalValue: undefined }));

    expect(caixa.queryByText("=== VALORES ===")).not.toBeInTheDocument();
  });
});

describe("KitchenPrintArea - pagamento", () => {
  it("dinheiro com troco: cobra na entrega e mostra quanto separar", () => {
    const { caixa } = renderVias(makeOrder({ changeFor: "151" }));

    expect(caixa.getByText("Forma: Dinheiro")).toBeInTheDocument();
    expect(caixa.getByText(/COBRAR R\$\s*86,00 NA ENTREGA/)).toBeInTheDocument();
    expect(caixa.getByText(/Cliente paga com R\$\s*151,00/)).toBeInTheDocument();
    expect(caixa.getByText(/Separar R\$\s*65,00 de troco/)).toBeInTheDocument();
  });

  it("dinheiro sem troco: cobra, sem linha de troco", () => {
    const { caixa } = renderVias(makeOrder());

    expect(caixa.getByText(/COBRAR R\$\s*86,00 NA ENTREGA/)).toBeInTheDocument();
    expect(caixa.queryByText(/Cliente paga com/)).not.toBeInTheDocument();
    expect(caixa.queryByText(/de troco/)).not.toBeInTheDocument();
  });

  it("pagamento que não é dinheiro não imprime troco", () => {
    const { caixa } = renderVias(
      makeOrder({
        changeFor: "151",
        payments: [{ id: "p1", paymentMethod: "PIX", status: "PENDING", amount: 86 }],
      }),
    );

    expect(caixa.getByText("Forma: PIX")).toBeInTheDocument();
    expect(caixa.queryByText(/Cliente paga com/)).not.toBeInTheDocument();
    expect(caixa.queryByText(/de troco/)).not.toBeInTheDocument();
  });

  it("pagamento concluído imprime PAGO e não cobra", () => {
    const { caixa } = renderVias(
      makeOrder({
        payments: [{ id: "p1", paymentMethod: "CREDIT_CARD", status: "COMPLETED", amount: 86 }],
      }),
    );

    expect(caixa.getByText("Forma: Cartão de Crédito")).toBeInTheDocument();
    expect(caixa.getByText("PAGO")).toBeInTheDocument();
    expect(caixa.queryByText(/COBRAR/)).not.toBeInTheDocument();
  });

  it("sem pagamento avisa que não foi informado", () => {
    const { caixa } = renderVias(makeOrder({ payments: [] }));

    expect(caixa.getByText("Pagamento não informado")).toBeInTheDocument();
  });
});

describe("KitchenPrintArea - retirada", () => {
  it("vira via do balcão, sem endereço nem taxa de entrega, cobrando na retirada", () => {
    const { caixa } = renderVias(
      makeOrder({
        fulfillmentType: "PICKUP",
        totalShipping: 0,
        totalValue: 78,
        delivery: null,
        payments: [{ id: "p1", paymentMethod: "CASH", status: "PENDING", amount: 78 }],
      }),
    );

    expect(caixa.getByText("BALCÃO")).toBeInTheDocument();
    expect(caixa.queryByText("=== ENDEREÇO ===")).not.toBeInTheDocument();
    expect(caixa.queryByText("Taxa de entrega")).not.toBeInTheDocument();
    expect(caixa.getByText(/COBRAR R\$\s*78,00 NA RETIRADA/)).toBeInTheDocument();
  });
});
