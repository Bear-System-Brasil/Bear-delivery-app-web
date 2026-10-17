import {
  DELIVERY_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type KitchenAddOn,
  type KitchenDeliveryStatus,
  type KitchenOrder,
  type KitchenOrderItem,
  type KitchenPeriod,
  type KitchenVariation,
} from "./types";

/**
 * Faixas de envelhecimento do card — a cor é lida antes do número.
 *
 * Dados reais ficam em aberto por horas ou dias, então a escala só sobe até
 * 45 min; passado isso, o tom vira neutro ("antigo") em vez de continuar
 * escalando para vermelho, que perderia o sentido de alerta.
 */
export type ElapsedTier = "fresh" | "warm" | "late" | "critical" | "old";

export interface ElapsedInfo {
  minutes: number;
  label: string;
  tier: ElapsedTier;
  className: string;
}

const TIER_CLASSES: Record<ElapsedTier, string> = {
  fresh: "bg-slate-100 text-slate-600",
  warm: "bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300",
  late: "bg-brand-200 dark:bg-brand-800 text-brand-900 dark:text-brand-300",
  critical: "bg-red-600 text-white",
  old: "bg-slate-200 text-slate-500",
};

/** `dateString` é `statusChangedAt`: tempo na coluna atual, não desde a criação. */
export function getElapsed(dateString: string): ElapsedInfo {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(dateString).getTime()) / 60_000),
  );

  const tier: ElapsedTier =
    minutes > 45 ? "old" : minutes >= 30 ? "critical" : minutes >= 15 ? "late" : minutes >= 5 ? "warm" : "fresh";

  const hours = Math.floor(minutes / 60);
  const label =
    minutes < 1
      ? "agora"
      : minutes < 60
        ? `${minutes} min`
        : `${hours}h${minutes % 60 > 0 ? ` ${minutes % 60}min` : ""}`;

  return { minutes, label, tier, className: TIER_CLASSES[tier] };
}

export function getItemName(item: KitchenOrderItem): string {
  return item.product?.name || `Produto ${item.productId.slice(0, 6)}`;
}

/**
 * Nome do tamanho escolhido (ex.: "Tradicional (18 cm)"), o mesmo que o
 * cliente vê no carrinho. `null` quando o nome não veio — quem chama não
 * mostra nada no lugar, em vez de um genérico "Variação".
 */
export function getVariationName(variation: KitchenVariation): string | null {
  return variation.productVariation?.name?.trim() || null;
}

/**
 * Nome real do adicional (ex.: "Bacon extra"). `null` quando o nome não
 * veio — quem chama não mostra nada no lugar, em vez de um genérico
 * "Adicional".
 */
export function getAddOnName(addOn: KitchenAddOn): string | null {
  return addOn.productAddOns?.name?.trim() || null;
}

/** Adicionais do item que têm nome, prontos para listar. */
export function getNamedAddOns(
  item: KitchenOrderItem,
): Array<{ id: string; name: string; quantity: number; observations?: string | null }> {
  return (item.addOns ?? []).flatMap((addOn) => {
    const name = getAddOnName(addOn);
    return name
      ? [{ id: addOn.id, name, quantity: addOn.quantity, observations: addOn.observations }]
      : [];
  });
}

/**
 * Algum item do pedido tem tamanho? O card só indica presença ("Com
 * tamanho"), uma vez por pedido; o nome do tamanho fica no detalhe e na
 * comanda.
 */
export function hasSizes(order: KitchenOrder): boolean {
  return (order.orderedItems ?? []).some((item) => (item.variations?.length ?? 0) > 0);
}

/**
 * Existe adicional em algum item do pedido? Tamanho não conta: tamanho e
 * adicional são coisas diferentes (ver `hasSizes`). O card não lista cada
 * adicional (viraria uma parede de nomes); só indica presença e manda pro
 * modal.
 */
export function hasAddOns(order: KitchenOrder): boolean {
  return (order.orderedItems ?? []).some((item) => (item.addOns?.length ?? 0) > 0);
}

export function getOrderLabel(order: KitchenOrder): string {
  return String(order.orderNumber ?? order.id.slice(0, 6));
}

export function getCustomerName(order: KitchenOrder): string {
  return order.customer?.name?.trim() || "Cliente não identificado";
}

export function getPaymentLabel(order: KitchenOrder): string | null {
  const method = order.payments?.[0]?.paymentMethod;
  if (!method) return null;
  return PAYMENT_METHOD_LABELS[String(method)] ?? String(method);
}

/**
 * Selo de atendimento: `fulfillmentType` é a fonte da verdade (não deduzir
 * pela relação `delivery`, que pode ser `null` numa retirada normalmente).
 */
export function getFulfillmentLabel(order: KitchenOrder): string {
  if (order.fulfillmentType === "PICKUP") return "Retirada no local";

  const deliveryStatus = order.delivery?.status;
  if (deliveryStatus) {
    return DELIVERY_STATUS_LABELS[deliveryStatus as KitchenDeliveryStatus] ?? "Entrega";
  }
  return "Entrega";
}

/** Tom informativo, sem semântica de erro — nem para retirada, nem para entrega. */
export function getFulfillmentToneClass(order: KitchenOrder): string {
  if (order.fulfillmentType === "PICKUP") return "bg-violet-100 dark:bg-violet-900 text-violet-800 dark:text-violet-300";

  switch (order.delivery?.status) {
    case "PICKED_UP":
      return "bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-300";
    case "ACCEPTED":
      return "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-300";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Filtro de dia — startDate/endDate ISO com offset local (ver kitchen-orders.md)
// ─────────────────────────────────────────────────────────────────────────────

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function localOffset(date: Date): string {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  return `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** `startDate`/`endDate` inclusivos do dia informado, no fuso local. */
export function getDayRange(date: Date = new Date()): { startDate: string; endDate: string } {
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const offset = localOffset(date);

  return {
    startDate: `${year}-${month}-${day}T00:00:00${offset}`,
    endDate: `${year}-${month}-${day}T23:59:59.999${offset}`,
  };
}

/** Valor pro `<input type="date">`, no fuso local (não `toISOString`, que vira UTC). */
export function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * `startDate`/`endDate` do período selecionado — só usado por Concluídos e
 * Cancelados. `"all"` some com o filtro por completo (o backend recebe a
 * chamada sem esses params).
 */
export function getPeriodRange(
  period: KitchenPeriod,
  customDate: Date,
): { startDate?: string; endDate?: string } {
  if (period === "all") return {};

  if (period === "today") return getDayRange(new Date());

  if (period === "7d") {
    const start = new Date();
    start.setDate(start.getDate() - 6);
    return {
      startDate: getDayRange(start).startDate,
      endDate: getDayRange(new Date()).endDate,
    };
  }

  return getDayRange(customDate);
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  return toDateInputValue(a) === toDateInputValue(b);
}
