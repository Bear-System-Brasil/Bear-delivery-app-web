import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getAddOnName,
  getCustomerName,
  getDayRange,
  getElapsed,
  getFulfillmentLabel,
  getFulfillmentToneClass,
  getItemName,
  getItemSizeLabel,
  getNamedAddOns,
  getOrderLabel,
  getPaymentLabel,
  getPeriodRange,
  getVariationName,
  hasAddOns,
  isSameLocalDay,
  toDateInputValue,
} from "./helpers";
import type { KitchenOrder, KitchenOrderItem } from "./types";

function baseOrder(overrides: Partial<KitchenOrder> = {}): KitchenOrder {
  return {
    id: "order-abcdef123456",
    status: "ORDERED",
    created_at: "2024-05-01T10:00:00Z",
    statusChangedAt: "2024-05-01T10:00:00Z",
    fulfillmentType: "DELIVERY",
    ...overrides,
  };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Mesma fórmula de `localOffset` no helper, mas calculada de forma
 * independente aqui (via Date nativo) para o teste não depender do fuso
 * horário fixo de uma máquina específica. */
function expectedOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

describe("getElapsed", () => {
  const now = new Date("2024-05-01T12:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("classifica como 'fresh' com menos de 5 minutos e mostra 'agora' no primeiro minuto", () => {
    const info = getElapsed(new Date(now.getTime() - 30_000).toISOString());
    expect(info.minutes).toBe(0);
    expect(info.tier).toBe("fresh");
    expect(info.label).toBe("agora");
  });

  it("classifica como 'warm' entre 5 e 14 minutos", () => {
    const info = getElapsed(new Date(now.getTime() - 5 * 60_000).toISOString());
    expect(info.tier).toBe("warm");
    expect(info.label).toBe("5 min");
  });

  it("classifica como 'late' entre 15 e 29 minutos", () => {
    const info = getElapsed(new Date(now.getTime() - 15 * 60_000).toISOString());
    expect(info.tier).toBe("late");
  });

  it("classifica como 'critical' entre 30 e 45 minutos", () => {
    const info = getElapsed(new Date(now.getTime() - 30 * 60_000).toISOString());
    expect(info.tier).toBe("critical");
  });

  it("classifica como 'old' acima de 45 minutos, e não sobe pra vermelho de novo", () => {
    const info = getElapsed(new Date(now.getTime() - 46 * 60_000).toISOString());
    expect(info.tier).toBe("old");

    const muitoAntigo = getElapsed(new Date(now.getTime() - 5 * 60 * 60_000).toISOString());
    expect(muitoAntigo.tier).toBe("old");
  });

  it("formata rótulo em horas e minutos quando passa de 1h", () => {
    const info = getElapsed(new Date(now.getTime() - 90 * 60_000).toISOString());
    expect(info.label).toBe("1h 30min");
  });

  it("formata rótulo só em horas quando é hora cheia", () => {
    const info = getElapsed(new Date(now.getTime() - 120 * 60_000).toISOString());
    expect(info.label).toBe("2h");
  });

  it("nunca fica negativo mesmo se statusChangedAt vier no futuro (relógio do backend adiantado)", () => {
    const info = getElapsed(new Date(now.getTime() + 60_000).toISOString());
    expect(info.minutes).toBe(0);
    expect(info.tier).toBe("fresh");
  });

  it("cada tier expõe a className correspondente", () => {
    expect(getElapsed(new Date(now.getTime() - 60_000).toISOString()).className).toContain(
      "slate",
    );
    expect(
      getElapsed(new Date(now.getTime() - 30 * 60_000).toISOString()).className,
    ).toContain("red");
  });
});

describe("getItemName", () => {
  it("usa o nome do produto quando presente", () => {
    const item = { productId: "abcdef123456", product: { id: "p1", name: "Feijoada" } } as KitchenOrderItem;
    expect(getItemName(item)).toBe("Feijoada");
  });

  it("cai para o id truncado quando não há produto", () => {
    const item = { productId: "abcdef123456" } as KitchenOrderItem;
    expect(getItemName(item)).toBe("Produto abcdef");
  });
});

describe("getVariationName", () => {
  it("devolve o nome do tamanho escolhido", () => {
    expect(
      getVariationName({ id: "v1", productVariation: { name: "Tradicional (18 cm)" } }),
    ).toBe("Tradicional (18 cm)");
  });

  it("devolve null quando o nome não veio, em vez de um genérico", () => {
    expect(getVariationName({ id: "v1" })).toBeNull();
    expect(getVariationName({ id: "v1", productVariation: null })).toBeNull();
    expect(getVariationName({ id: "v1", productVariation: { name: "  " } })).toBeNull();
  });
});

describe("getAddOnName / getNamedAddOns", () => {
  it("devolve o nome real do adicional", () => {
    expect(getAddOnName({ id: "a1", quantity: 1, productAddOns: { name: "Bacon extra" } })).toBe(
      "Bacon extra",
    );
  });

  it("devolve null quando o nome não veio, em vez de um genérico", () => {
    expect(getAddOnName({ id: "a1", quantity: 1 })).toBeNull();
    expect(getAddOnName({ id: "a1", quantity: 1, productAddOns: null })).toBeNull();
  });

  it("lista só os adicionais com nome", () => {
    const item = {
      id: "i1",
      productId: "p1",
      quantity: 1,
      addOns: [
        { id: "a1", quantity: 1, productAddOns: { name: "Bacon extra" }, observations: "crocante" },
        { id: "a2", quantity: 1, productAddOns: null },
      ],
    } as KitchenOrderItem;
    expect(getNamedAddOns(item)).toEqual([
      { id: "a1", name: "Bacon extra", observations: "crocante" },
    ]);
  });
});

describe("getItemSizeLabel", () => {
  it("devolve o nome do tamanho do item", () => {
    const item = {
      id: "i1",
      productId: "p1",
      quantity: 1,
      variations: [{ id: "v1", productVariation: { name: "Tradicional (18 cm)" } }],
    } as KitchenOrderItem;
    expect(getItemSizeLabel(item)).toBe("Tradicional (18 cm)");
  });

  it("é null quando o item não tem tamanho ou o nome não veio", () => {
    expect(getItemSizeLabel({ id: "i1", productId: "p1", quantity: 1 })).toBeNull();
    expect(
      getItemSizeLabel({ id: "i1", productId: "p1", quantity: 1, variations: [{ id: "v1" }] }),
    ).toBeNull();
  });
});

describe("hasAddOns", () => {
  it("é false quando não há itens", () => {
    expect(hasAddOns(baseOrder())).toBe(false);
  });

  it("é false quando os itens não têm adicionais", () => {
    const order = baseOrder({
      orderedItems: [{ id: "i1", productId: "p1", quantity: 1 } as KitchenOrderItem],
    });
    expect(hasAddOns(order)).toBe(false);
  });

  it("é true quando algum item tem adicional", () => {
    const order = baseOrder({
      orderedItems: [
        { id: "i1", productId: "p1", quantity: 1, addOns: [{ id: "a1", quantity: 1 }] } as KitchenOrderItem,
      ],
    });
    expect(hasAddOns(order)).toBe(true);
  });

  it("é false quando o item só tem tamanho — tamanho não é adicional", () => {
    const order = baseOrder({
      orderedItems: [
        { id: "i1", productId: "p1", quantity: 1, variations: [{ id: "v1" }] } as KitchenOrderItem,
      ],
    });
    expect(hasAddOns(order)).toBe(false);
  });
});

describe("getOrderLabel", () => {
  it("usa orderNumber quando presente", () => {
    expect(getOrderLabel(baseOrder({ orderNumber: 42 }))).toBe("42");
  });

  it("cai para o id truncado sem orderNumber", () => {
    expect(getOrderLabel(baseOrder({ id: "abcdef123456" }))).toBe("abcdef");
  });
});

describe("getCustomerName", () => {
  it("usa o nome do cliente, sem espaços nas bordas", () => {
    const order = baseOrder({ customer: { id: "c1", name: "  Maria  " } });
    expect(getCustomerName(order)).toBe("Maria");
  });

  it("cai para 'Cliente não identificado' sem cliente ou com nome vazio", () => {
    expect(getCustomerName(baseOrder())).toBe("Cliente não identificado");
    expect(getCustomerName(baseOrder({ customer: { id: "c1", name: "   " } }))).toBe(
      "Cliente não identificado",
    );
  });
});

describe("getPaymentLabel", () => {
  it("traduz o método de pagamento conhecido", () => {
    const order = baseOrder({
      payments: [{ id: "pay1", amount: 35, paymentMethod: "PIX" }],
    });
    expect(getPaymentLabel(order)).toBe("PIX");
  });

  it("usa o valor cru quando o método não está no dicionário", () => {
    const order = baseOrder({
      payments: [{ id: "pay1", amount: 35, paymentMethod: "VOUCHER" }],
    });
    expect(getPaymentLabel(order)).toBe("VOUCHER");
  });

  it("retorna null sem pagamento", () => {
    expect(getPaymentLabel(baseOrder())).toBeNull();
    expect(getPaymentLabel(baseOrder({ payments: [] }))).toBeNull();
  });
});

describe("getFulfillmentLabel / getFulfillmentToneClass", () => {
  it("retirada no local não depende do status da entrega", () => {
    const order = baseOrder({
      fulfillmentType: "PICKUP",
      delivery: { id: "d1", status: "PICKED_UP" },
    });
    expect(getFulfillmentLabel(order)).toBe("Retirada no local");
    expect(getFulfillmentToneClass(order)).toContain("violet");
  });

  it("entrega sem status ainda vinculado mostra 'Entrega' genérico", () => {
    const order = baseOrder({ fulfillmentType: "DELIVERY" });
    expect(getFulfillmentLabel(order)).toBe("Entrega");
    expect(getFulfillmentToneClass(order)).toContain("slate");
  });

  it("traduz cada status de entrega conhecido e aplica o tom correspondente", () => {
    const pending = baseOrder({ delivery: { id: "d1", status: "PENDING" } });
    expect(getFulfillmentLabel(pending)).toBe("aguardando entregador");

    const accepted = baseOrder({ delivery: { id: "d1", status: "ACCEPTED" } });
    expect(getFulfillmentLabel(accepted)).toBe("entregador a caminho");
    expect(getFulfillmentToneClass(accepted)).toContain("blue");

    const pickedUp = baseOrder({ delivery: { id: "d1", status: "PICKED_UP" } });
    expect(getFulfillmentLabel(pickedUp)).toBe("coletado");
    expect(getFulfillmentToneClass(pickedUp)).toContain("emerald");
  });

  it("status de entrega desconhecido cai no rótulo genérico 'Entrega'", () => {
    const order = baseOrder({ delivery: { id: "d1", status: "ALGO_NOVO" } });
    expect(getFulfillmentLabel(order)).toBe("Entrega");
  });
});

describe("getDayRange", () => {
  it("gera startDate/endDate cobrindo o dia inteiro no fuso local", () => {
    const date = new Date(2024, 4, 15); // 15 de maio de 2024, meio-dia local implícito (00:00)
    const { startDate, endDate } = getDayRange(date);
    const offset = expectedOffset(date);

    expect(startDate).toBe(`2024-05-15T00:00:00${offset}`);
    expect(endDate).toBe(`2024-05-15T23:59:59.999${offset}`);
  });

  it("usa 'now' por padrão quando nenhuma data é passada", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 5));

    const { startDate } = getDayRange();
    expect(startDate.startsWith("2024-01-05T00:00:00")).toBe(true);

    vi.useRealTimers();
  });

  it("preenche dia e mês com zero à esquerda", () => {
    const date = new Date(2024, 0, 3); // 3 de janeiro
    const { startDate } = getDayRange(date);
    expect(startDate.startsWith("2024-01-03T00:00:00")).toBe(true);
  });
});

describe("toDateInputValue", () => {
  it("formata no fuso local, sem virar UTC", () => {
    const date = new Date(2024, 11, 25); // 25 de dezembro, meia-noite local
    expect(toDateInputValue(date)).toBe("2024-12-25");
  });
});

describe("isSameLocalDay", () => {
  it("é true para datas no mesmo dia local, com horários diferentes", () => {
    const a = new Date(2024, 4, 15, 8, 0);
    const b = new Date(2024, 4, 15, 23, 59);
    expect(isSameLocalDay(a, b)).toBe(true);
  });

  it("é false para dias diferentes", () => {
    const a = new Date(2024, 4, 15, 23, 59);
    const b = new Date(2024, 4, 16, 0, 1);
    expect(isSameLocalDay(a, b)).toBe(false);
  });
});

describe("getPeriodRange", () => {
  const customDate = new Date(2024, 2, 10);

  it("'all' não aplica nenhum filtro de data", () => {
    expect(getPeriodRange("all", customDate)).toEqual({});
  });

  it("'today' usa o dia atual real, não a customDate", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 6, 20));

    const { startDate } = getPeriodRange("today", customDate);
    expect(startDate?.startsWith("2024-07-20")).toBe(true);

    vi.useRealTimers();
  });

  it("'custom' usa a data informada", () => {
    const { startDate } = getPeriodRange("custom", customDate);
    expect(startDate?.startsWith("2024-03-10")).toBe(true);
  });

  it("'7d' cobre do dia atual até 6 dias atrás (7 dias corridos no total)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 6, 20));

    const { startDate, endDate } = getPeriodRange("7d", customDate);
    expect(startDate?.startsWith("2024-07-14")).toBe(true);
    expect(endDate?.startsWith("2024-07-20")).toBe(true);

    vi.useRealTimers();
  });
});
