import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyOrder } from "./order-management";
import {
  getAddOnLabel,
  getColumnForOrder,
  getElapsedTime,
  getOrderItemDisplayName,
  getOrderItemTotal,
  getOrderStatusLabel,
  getPaymentMethodLabel,
  getVariationLabel,
  mergeIdenticalItems,
  withAddOnQuantity,
} from "./order-management";

function orderWithStatus(status: string): CompanyOrder {
  return { status } as unknown as CompanyOrder;
}

describe("getOrderItemTotal", () => {
  it("soma o produto sozinho quando não há adicionais nem variações", () => {
    expect(getOrderItemTotal({ quantity: 2, unitPrice: 35 })).toBe(70);
  });

  it("cobra o adicional por unidade do produto (order-item.md)", () => {
    // 2x Feijoada (R$35) + 2x Torresmo extra (R$5, por unidade do produto)
    // produto: 2 × 35 = 70 · complemento: 2 × 2 × 5 = 20 · total: 90
    const total = getOrderItemTotal({
      quantity: 2,
      unitPrice: 35,
      addOns: [{ priceSnapshot: 5, quantity: 2 }],
    });
    expect(total).toBe(90);
  });

  it("soma variação e adicional juntos, cada um escalando com a quantidade do item", () => {
    const total = getOrderItemTotal({
      quantity: 2,
      unitPrice: 35,
      addOns: [{ priceSnapshot: 5, quantity: 2 }],
      variations: [{ priceSnapshot: 5 }],
    });
    expect(total).toBe(100);
  });

  it("trata unitPrice/priceSnapshot ausentes como zero, sem quebrar", () => {
    expect(getOrderItemTotal({ quantity: 3 })).toBe(0);
  });
});

describe("getOrderItemDisplayName", () => {
  it("usa o nome do produto quando presente", () => {
    expect(
      getOrderItemDisplayName({ productId: "abc123", product: { name: "Pizza" } }),
    ).toBe("Pizza");
  });

  it("cai para um rótulo com o id truncado quando não há produto", () => {
    expect(getOrderItemDisplayName({ productId: "abcdef123456" })).toBe(
      "Produto #abcdef",
    );
  });
});

describe("getAddOnLabel / getVariationLabel", () => {
  it("segue a cadeia de fallback até achar um nome utilizável", () => {
    expect(getAddOnLabel({ productAddOns: { description: "Bacon extra" } })).toBe(
      "Bacon extra",
    );
    expect(getAddOnLabel({})).toBe("Adicional");
  });

  it("mesma cadeia de fallback para variação", () => {
    expect(
      getVariationLabel({ productVariation: { name: "Tamanho grande" } }),
    ).toBe("Tamanho grande");
    expect(getVariationLabel({})).toBe("Variação");
  });
});

describe("mergeIdenticalItems", () => {
  // Forma observada no pedido #6 da Pastelaria Maluca (17/10).
  const caldo600 = {
    productId: "caldo",
    quantity: 3,
    unitPrice: 6,
    observations: null,
    variations: [{ productVariationId: "v600", productVariation: { name: "600ml" }, priceSnapshot: 0 }],
    addOns: [
      { productAddOnsId: "limao", productAddOns: { name: "Com limão" }, quantity: 4, priceSnapshot: 0.01 },
      { productAddOnsId: "abacaxi", productAddOns: { name: "Com abacaxi" }, quantity: 4, priceSnapshot: 1.5 },
    ],
  };

  it("junta linhas idênticas somando a quantidade e mantém o id da primeira", () => {
    const merged = mergeIdenticalItems([
      { ...caldo600, id: "a" },
      { ...caldo600, id: "b" },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ id: "a", quantity: 6 });
  });

  it("junta mesmo com os adicionais em outra ordem", () => {
    const merged = mergeIdenticalItems([
      { ...caldo600, id: "a" },
      { ...caldo600, id: "b", addOns: [...caldo600.addOns].reverse() },
    ]);
    expect(merged).toHaveLength(1);
  });

  it("não junta tamanho diferente", () => {
    const merged = mergeIdenticalItems([
      { ...caldo600, id: "a" },
      {
        ...caldo600,
        id: "b",
        quantity: 1,
        variations: [{ productVariationId: "v300", productVariation: { name: "300 ml" }, priceSnapshot: 0 }],
      },
    ]);
    expect(merged.map((item) => item.quantity)).toEqual([3, 1]);
  });

  it("não junta quantidade de adicional diferente", () => {
    const merged = mergeIdenticalItems([
      { ...caldo600, id: "a" },
      { ...caldo600, id: "b", addOns: [{ ...caldo600.addOns[0], quantity: 1 }, caldo600.addOns[1]] },
    ]);
    expect(merged).toHaveLength(2);
  });

  it("não junta observação diferente", () => {
    const merged = mergeIdenticalItems([
      { ...caldo600, id: "a" },
      { ...caldo600, id: "b", observations: "sem gelo" },
    ]);
    expect(merged).toHaveLength(2);
  });

  it("mantém a ordem da primeira aparição", () => {
    const pastel = { productId: "pastel", quantity: 1, id: "p" };
    const merged = mergeIdenticalItems([{ ...caldo600, id: "a" }, pastel, { ...caldo600, id: "b" }]);
    expect(merged.map((item) => item.productId)).toEqual(["caldo", "pastel"]);
  });
});

describe("withAddOnQuantity", () => {
  it("quantidade 1 ou ausente fica só com o nome", () => {
    expect(withAddOnQuantity("Morango", 1)).toBe("Morango");
    expect(withAddOnQuantity("Morango")).toBe("Morango");
    expect(withAddOnQuantity("Morango", null)).toBe("Morango");
  });

  it("quantidade maior que 1 vira \"4x Morango\"", () => {
    expect(withAddOnQuantity("Morango", 4)).toBe("4x Morango");
  });
});

describe("getColumnForOrder", () => {
  it("mapeia cada status de produção para a coluna do kanban", () => {
    expect(getColumnForOrder(orderWithStatus("ORDERED"))).toBe("new");
    expect(getColumnForOrder(orderWithStatus("IN_PRODUCTION"))).toBe("preparing");
    expect(getColumnForOrder(orderWithStatus("READY_FOR_PICKUP"))).toBe("ready");
  });

  it("trata cancelado separadamente das colunas normais", () => {
    expect(getColumnForOrder(orderWithStatus("CANCELED"))).toBe("canceled");
  });

  it("concluído e estados que nunca viraram pedido caem em completed", () => {
    expect(getColumnForOrder(orderWithStatus("COMPLETED"))).toBe("completed");
    expect(getColumnForOrder(orderWithStatus("CART"))).toBe("completed");
    expect(getColumnForOrder(orderWithStatus("AWAITING_PAYMENT"))).toBe("completed");
    expect(getColumnForOrder(orderWithStatus("ABANDONED"))).toBe("completed");
  });
});

describe("getElapsedTime", () => {
  const now = new Date("2024-06-01T12:00:00.000Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function minutesAgo(minutes: number): string {
    return new Date(now.getTime() - minutes * 60_000).toISOString();
  }

  it("mostra 'Agora' para menos de um minuto", () => {
    expect(getElapsedTime(minutesAgo(0))).toBe("Agora");
  });

  it("mostra só minutos quando menor que uma hora", () => {
    expect(getElapsedTime(minutesAgo(15))).toBe("15min");
  });

  it("mostra horas e minutos quando não é hora cheia", () => {
    expect(getElapsedTime(minutesAgo(90))).toBe("1h 30min");
  });

  it("mostra só horas quando é hora cheia", () => {
    expect(getElapsedTime(minutesAgo(120))).toBe("2h");
  });
});

describe("getPaymentMethodLabel", () => {
  it("traduz os métodos conhecidos", () => {
    expect(getPaymentMethodLabel("CASH")).toBe("Dinheiro");
    expect(getPaymentMethodLabel("PIX")).toBe("PIX");
  });

  it("cai para 'Não informado' quando o método não vem", () => {
    expect(getPaymentMethodLabel(undefined)).toBe("Não informado");
  });

  it("retorna o próprio valor quando o método é desconhecido", () => {
    expect(getPaymentMethodLabel("BOLETO")).toBe("BOLETO");
  });
});

describe("getOrderStatusLabel (constants)", () => {
  it("traduz os status conhecidos", () => {
    expect(getOrderStatusLabel("ORDERED")).toBe("Novo");
    expect(getOrderStatusLabel("READY_FOR_PICKUP")).toBe("Pronto");
  });

  it("retorna o próprio valor quando o status é desconhecido", () => {
    expect(getOrderStatusLabel("ALGO_NOVO")).toBe("ALGO_NOVO");
  });
});
