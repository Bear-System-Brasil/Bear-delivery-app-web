import { getPaymentMethodLabel } from "@/constants/order-management";
import {
  PaymentMethod,
  PaymentStatus,
  type Address,
  type Delivery,
  type Payment,
} from "@/services/api";
import { onlyNumbers } from "@/utils";

export type DeliveryStatus = Delivery["status"];

/**
 * Janela do grupo "Entregues" na tela do entregador. Mais antigo que isso sai
 * da tela operacional e só aparece no histórico.
 */
export const RECENT_DELIVERY_WINDOW_MS = 60 * 60 * 1000;

const ACTIVE_STATUSES = new Set<DeliveryStatus>(["ACCEPTED", "PICKED_UP"]);
const FINISHED_STATUSES = new Set<DeliveryStatus>([
  "DELIVERED",
  "RECEIVED",
  "COMPLETED",
]);

/** Aceita pelo entregador e ainda não fechada. */
export const isActiveForDriver = (delivery: Delivery) =>
  ACTIVE_STATUSES.has(delivery.status);

/** Fechada com sucesso - DELIVERED e os estados que vêm depois dele. */
export const isFinished = (delivery: Delivery) =>
  FINISHED_STATUSES.has(delivery.status);

export const isCanceled = (delivery: Delivery) =>
  delivery.status === "CANCELED";

export const isAvailable = (delivery: Delivery) =>
  delivery.status === "PENDING";

/**
 * A entrega é do restaurante do entregador? (LDMF-322)
 *
 * O backend devolve pendentes de todos os restaurantes. Entregador vinculado
 * a um restaurante só vê as dele; sem vínculo (o futuro entregador livre)
 * vê tudo, até o backend definir quais restaurantes aceitam entregador
 * livre (LDMF-323). Entrega sem restaurante identificado fica de fora pra
 * quem tem vínculo: na dúvida, não mostra pedido de outro restaurante.
 */
export function isFromCourierCompany(
  delivery: Delivery,
  courierCompanyId: string | null | undefined,
): boolean {
  if (!courierCompanyId) return true;
  const companyId = delivery.order?.company?.id ?? delivery.order?.companyId;
  return companyId === courierCompanyId;
}

/**
 * Cancelar vale só antes da coleta. O limite documentado é PICKED_UP e é
 * exclusivo: depois de pegar a comida no restaurante não dá mais pra
 * cancelar - a partir daí o caminho é entregar.
 */
/** Devolver à lista de disponíveis: só antes da coleta (delivery.md). */
export const canReturn = (delivery: Delivery) => delivery.status === "ACCEPTED";

/**
 * Dados pessoais do cliente (nome, foto, telefone, rua e número) só depois do
 * aceite, enquanto a corrida é deste entregador. Na lista de disponíveis
 * todos os entregadores veem a entrega - mostrar ali expõe dado pessoal sem
 * necessidade (LGPD). Antes do aceite fica só a região (bairro e cidade),
 * que é o que ele precisa pra decidir se pega.
 */
export const canSeeCustomerData = (delivery: Delivery) =>
  delivery.status === "ACCEPTED" || delivery.status === "PICKED_UP";

/**
 * Aceita, mas a cozinha ainda não marcou o pedido como pronto: o entregador
 * não pode coletar. O backend hoje não barra essa transição, então a regra
 * vive aqui (decisão da LDMF-279). Só `READY_FOR_PICKUP` libera - com o
 * pedido ausente no payload, também espera, pra não liberar às cegas.
 */
export const isWaitingKitchen = (delivery: Delivery) =>
  delivery.status === "ACCEPTED" &&
  delivery.order?.status !== "READY_FOR_PICKUP";

/**
 * Próximo status do fluxo, ou null quando não há avanço possível pelo
 * entregador. É o que decide a ação primária do card.
 */
export function getNextStatus(delivery: Delivery): DeliveryStatus | null {
  if (isWaitingKitchen(delivery)) return null;
  if (delivery.status === "ACCEPTED") return "PICKED_UP";
  if (delivery.status === "PICKED_UP") return "DELIVERED";
  return null;
}

/** Timestamp utilizável, ou null quando a data não veio ou veio inválida. */
function toTime(value?: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

/** Quando a entrega foi fechada. `deliveryTime` é o campo certo; cai pro
 * `updated_at` quando o backend não preenche. */
export function getFinishedAt(delivery: Delivery): number | null {
  return toTime(delivery.deliveryTime) ?? toTime(delivery.updated_at);
}

function getCreatedAt(delivery: Delivery): number {
  return toTime(delivery.created_at) ?? 0;
}

export function isRecentlyFinished(delivery: Delivery, now: number) {
  if (!isFinished(delivery)) return false;
  const finishedAt = getFinishedAt(delivery);
  if (finishedAt === null) return false;
  return now - finishedAt <= RECENT_DELIVERY_WINDOW_MS;
}

/**
 * Quem já está na rua (PICKED_UP) vem antes de quem ainda precisa ser
 * coletado (ACCEPTED) - é a corrida que está correndo. Empate desempata pela
 * mais antiga, que é a que está esperando há mais tempo.
 */
const ACTIVE_RANK: Partial<Record<DeliveryStatus, number>> = {
  PICKED_UP: 0,
  ACCEPTED: 1,
};

export function sortActive(deliveries: Delivery[]): Delivery[] {
  return [...deliveries].sort((a, b) => {
    const rank = (ACTIVE_RANK[a.status] ?? 9) - (ACTIVE_RANK[b.status] ?? 9);
    if (rank !== 0) return rank;
    return getCreatedAt(a) - getCreatedAt(b);
  });
}

/** Disponíveis: a que está parada há mais tempo primeiro. */
export function sortOldestFirst(deliveries: Delivery[]): Delivery[] {
  return [...deliveries].sort((a, b) => getCreatedAt(a) - getCreatedAt(b));
}

/** Fechadas: a mais recente primeiro. */
export function sortNewestFinishedFirst(deliveries: Delivery[]): Delivery[] {
  return [...deliveries].sort(
    (a, b) =>
      (getFinishedAt(b) ?? getCreatedAt(b)) -
      (getFinishedAt(a) ?? getCreatedAt(a)),
  );
}

export const STATUS_LABEL: Record<DeliveryStatus, string> = {
  PENDING: "Disponível",
  ACCEPTED: "Coletar",
  PICKED_UP: "Na rua",
  DELIVERED: "Entregue",
  RECEIVED: "Recebida",
  COMPLETED: "Concluída",
  CANCELED: "Cancelada",
};

/**
 * Exhaustivo de propósito: o `StatusBadge` antigo tratava PICKED_UP e jogava
 * todo o resto em "Aceita", então CANCELED aparecia como aceita se algum dia
 * chegasse na tela.
 */
export const STATUS_TONE: Record<DeliveryStatus, string> = {
  PENDING:
    "bg-brand-100 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300",
  ACCEPTED:
    "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
  PICKED_UP:
    "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300",
  DELIVERED:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  RECEIVED:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  COMPLETED:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
  CANCELED: "bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300",
};

/**
 * Endereço em duas linhas para leitura rápida na moto: a primeira é o que se
 * digita num porteiro eletrônico, a segunda situa o bairro.
 */
export function formatAddressLines(address?: Address): string[] {
  if (!address) return [];

  const line1 = [address.street, address.number].filter(Boolean).join(", ");
  const line2 = [address.neighborhood, address.city, address.state]
    .filter(Boolean)
    .join(" · ");

  return [line1, address.complement, line2, address.zipCode]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
}

/**
 * Endereço que o entregador pode ver agora: completo depois do aceite, só a
 * região (bairro · cidade · UF) antes - ver `canSeeCustomerData`.
 */
export function formatVisibleAddressLines(delivery: Delivery): string[] {
  if (canSeeCustomerData(delivery)) {
    return formatAddressLines(delivery.deliveryAddress);
  }

  const address = delivery.deliveryAddress;
  if (!address) return [];

  const area = [address.neighborhood, address.city, address.state]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(" · ");

  return area ? [area] : [];
}

/**
 * Consulta do Google Maps montada a partir do endereço em TEXTO.
 *
 * Não usa `latitude`/`longitude` de propósito: hoje o cadastro do cliente
 * grava a coordenada de onde o celular estava no checkout (ou nenhuma, quando
 * o endereço foi criado pelo perfil), então mandar o entregador pro pino
 * salvo é mandar pro lugar errado. O texto o Maps geocodifica na hora.
 */
export function buildMapsLink(address?: Address): string | null {
  if (!address) return null;

  const query = [
    [address.street, address.number].filter(Boolean).join(", "),
    address.neighborhood,
    address.city,
    address.state,
    address.zipCode,
    "Brasil",
  ]
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(", ");

  if (!query || query === "Brasil") return null;

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * `order.company` e `order.customer` não são garantidos pelo contrato de
 * `GET /delivery/delivery-person/me` (delivery.md não documenta o
 * aninhamento). Lê defensivamente: quando vier, aparece; até lá, o fallback.
 */
export function getRestaurantName(delivery: Delivery): string {
  return delivery.order?.company?.tradeName?.trim() || "Restaurante";
}

export function getCustomerName(delivery: Delivery): string {
  return delivery.order?.customer?.name?.trim() || "Cliente";
}

/** Telefone só quando vier de verdade - o botão de ligar fica oculto sem ele. */
export function getCustomerPhone(delivery: Delivery): string | null {
  const phone = delivery.order?.customer?.phone?.trim();
  if (!phone) return null;

  const digits = onlyNumbers(phone);
  return digits.length >= 8 ? digits : null;
}

export function getRestaurantLogo(delivery: Delivery): string | null {
  return delivery.order?.company?.logo_url?.trim() || null;
}

export function getCustomerPhoto(delivery: Delivery): string | null {
  return delivery.order?.customer?.photoUrl?.trim() || null;
}

/** Pagamento que não vale mais - não conta nem como pago nem como a receber. */
const DEAD_PAYMENT_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.FAILED,
  PaymentStatus.CANCELLED,
  PaymentStatus.REFUNDED,
]);

export type PaymentSummary = {
  /** Tudo que vale já foi pago - o entregador não recebe nada na porta. */
  isPaid: boolean;
  /** Rótulos em pt-BR dos métodos que importam, sem repetir. */
  methods: string[];
  /** Quanto ainda falta receber. Zero quando `isPaid`. */
  amountDue: number;
  /**
   * Quanto o cliente entrega em dinheiro (`order.changeFor`). Null quando
   * ele não pediu troco, ou quando o valor informado não dá troco.
   */
  paysWith: number | null;
  /** Troco a levar = `paysWith` - `amountDue`. Null quando não há troco. */
  changeDue: number | null;
};

/** Centavos inteiros: 50 - 35.90 em ponto flutuante dá 14.100000000000001. */
function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Dois valores em dinheiro são o mesmo até o centavo? */
export function isSameMoney(a: number, b: number): boolean {
  return Math.round(a * 100) === Math.round(b * 100);
}

function readAmount(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * O que o entregador precisa saber sobre dinheiro antes de bater na porta:
 * se recebe alguma coisa e em qual forma.
 *
 * `order.payments` é lista porque o pedido pode ser dividido. Um pagamento
 * falho, cancelado ou estornado é descartado; sobrando algum não concluído,
 * a corrida é "receber na entrega" e o valor é a soma só desses. Sem
 * pagamento utilizável devolve null e o bloco some do card, em vez de
 * afirmar "pago" sobre um pedido do qual não se sabe nada.
 */
export function getPaymentSummary(delivery: Delivery): PaymentSummary | null {
  const payments = delivery.order?.payments;
  if (!Array.isArray(payments) || payments.length === 0) return null;

  const live = payments.filter(
    (payment) => payment && !DEAD_PAYMENT_STATUSES.has(payment.status),
  );
  if (live.length === 0) return null;

  const pending = live.filter(
    (payment) => payment.status !== PaymentStatus.COMPLETED,
  );

  const relevant = pending.length > 0 ? pending : live;
  const methods = [
    ...new Set(
      relevant.map((payment) => getPaymentMethodLabel(payment.paymentMethod)),
    ),
  ];

  const amountDue = roundMoney(
    pending.reduce((total, payment) => total + (readAmount(payment.amount) ?? 0), 0),
  );

  const isPaid = pending.length === 0;

  // `changeFor` é o que o cliente entrega, não o troco, e é campo do PEDIDO
  // (`order.changeFor`) - não do pagamento.
  const declaredPaysWith = readAmount(delivery.order?.changeFor);
  const paysWith =
    declaredPaysWith !== null && declaredPaysWith > 0
      ? roundMoney(declaredPaysWith)
      : null;

  // Três casos em que não há troco a levar:
  //
  // - o pedido já foi pago: o campo fica no pedido e sobrevive ao pagamento
  //   ser concluído, mas quem não recebe nada também não devolve troco;
  // - o cliente paga o valor exato;
  // - `changeFor` menor que a conta, que é dado incoerente;
  // - nada a receber em dinheiro: o campo também sobrevive à troca da forma
  //   de pagamento na tela do entregador, e cartão ou PIX não têm troco.
  //
  // Nesses casos a tela mostra "a receber" e pronto, em vez de anunciar troco
  // zero, negativo ou sobre dinheiro que ninguém vai entregar.
  const receivesCash = pending.some(
    (payment) => payment.paymentMethod === PaymentMethod.CASH,
  );
  const changeDue =
    !isPaid && receivesCash && paysWith !== null && paysWith > amountDue
      ? roundMoney(paysWith - amountDue)
      : null;

  return {
    isPaid,
    methods,
    amountDue,
    paysWith: changeDue === null ? null : paysWith,
    changeDue,
  };
}

/**
 * Pagamento cuja forma pode ser trocada pela tela do entregador: a corrida
 * está em andamento (aceita ou coletada) e há exatamente um pagamento ainda
 * a receber. Pedido dividido fica de fora - a tela não saberia qual dos
 * pagamentos mudou; esse caso se resolve em Finanças.
 */
export function getChangeablePayment(delivery: Delivery): Payment | null {
  if (delivery.status !== "ACCEPTED" && delivery.status !== "PICKED_UP") {
    return null;
  }

  const payments = delivery.order?.payments;
  if (!Array.isArray(payments)) return null;

  const toReceive = payments.filter(
    (payment) =>
      payment &&
      !DEAD_PAYMENT_STATUSES.has(payment.status) &&
      payment.status !== PaymentStatus.COMPLETED,
  );
  return toReceive.length === 1 ? toReceive[0] : null;
}

/**
 * Ganho do entregador. O backend ainda não manda esse campo, então hoje
 * devolve sempre null e o bloco fica oculto no card - melhor não mostrar
 * nada do que mostrar R$ 0,00 como se fosse o ganho real.
 */
export function getCourierEarnings(delivery: Delivery): number | null {
  const value = delivery.courierEarnings;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getOrderTotal(delivery: Delivery): number | null {
  const value = delivery.order?.totalValue;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** "3 disponíveis" / "1 disponível" - o plural de "disponível" é irregular. */
export function pluralizeAvailable(count: number): string {
  return count === 1 ? "1 disponível" : `${count} disponíveis`;
}
