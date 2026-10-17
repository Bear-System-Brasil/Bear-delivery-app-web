/**
 * Contrato da tela da cozinha (/kitchen).
 *
 * Tipado a partir do que `GET /order/company/status/:status` devolve (ver
 * docs/kitchen-integration.md e kitchen-orders.md), não do enum completo de
 * `Order`: a cozinha só conhece cinco status de trabalho — os quatro do fluxo
 * mais `CANCELED`, que fica oculto por padrão. `CART`, `AWAITING_PAYMENT` e
 * `ABANDONED` nunca chegam aqui.
 */

import type { PaymentMethod } from "@/services/api";

// ─────────────────────────────────────────────────────────────────────────────
// Status
// ─────────────────────────────────────────────────────────────────────────────

/** Os status do fluxo de preparo, em ordem de avanço via PATCH /order/:id/status. */
export const KITCHEN_WORKFLOW_STATUSES = [
  "ORDERED",
  "IN_PRODUCTION",
  "READY_FOR_PICKUP",
  "COMPLETED",
] as const;

export type KitchenWorkflowStatus = (typeof KITCHEN_WORKFLOW_STATUSES)[number];

/** Colunas do quadro: o fluxo de preparo + Cancelados (oculto por padrão). */
export const KITCHEN_STATUSES = [...KITCHEN_WORKFLOW_STATUSES, "CANCELED"] as const;

export type KitchenStatus = (typeof KITCHEN_STATUSES)[number];

/** Fonte da verdade para entrega vs. retirada — não deduzir pela relação `delivery`. */
export type KitchenFulfillmentType = "DELIVERY" | "PICKUP";

/**
 * Período do filtro de data — só se aplica a Concluídos e Cancelados
 * (`PAGINATED_STATUSES`, mais abaixo). Novos/Em Preparo/Prontos nunca usam
 * isso: eles sempre mostram todo pedido em aberto, sem corte de data.
 */
export type KitchenPeriod = "today" | "7d" | "all" | "custom";

export const KITCHEN_PERIOD_LABELS: Record<KitchenPeriod, string> = {
  today: "Hoje",
  "7d": "7 dias",
  all: "Tudo",
  custom: "Data específica",
};

/** Status da entrega que a cozinha precisa ler — só informativo, nunca acionável. */
export type KitchenDeliveryStatus = "PENDING" | "ACCEPTED" | "PICKED_UP";

export const DELIVERY_STATUS_LABELS: Record<KitchenDeliveryStatus, string> = {
  PENDING: "aguardando entregador",
  ACCEPTED: "entregador a caminho",
  PICKED_UP: "coletado",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Dinheiro",
  CREDIT_CARD: "Crédito",
  DEBIT_CARD: "Débito",
  PIX: "PIX",
  BANK_TRANSFER: "Transferência",
};

// ─────────────────────────────────────────────────────────────────────────────
// Pedido
// ─────────────────────────────────────────────────────────────────────────────

export interface KitchenAddOn {
  id: string;
  quantity: number;
  priceSnapshot?: number;
  /** Observação específica deste adicional (ex.: "bem crocante"). */
  observations?: string | null;
  productAddOns?: { description: string } | null;
}

export interface KitchenVariation {
  id: string;
  priceSnapshot?: number;
  /** Observação específica desta variação (ex.: "sem pimenta"). */
  observations?: string | null;
  /**
   * Tamanho escolhido. `/order/company/status/:status` devolve o nome em
   * `name` (ex.: "Tradicional (18 cm)") — não existe `description` aqui.
   */
  productVariation?: { name?: string } | null;
}

export interface KitchenOrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice?: number;
  product?: { id: string; name: string; salePrice?: number } | null;
  addOns?: KitchenAddOn[] | null;
  variations?: KitchenVariation[] | null;
  /** Observação do prato em si (ex.: "sem cebola, bem passado") — distinta da de cada adicional/variação. */
  observations?: string | null;
}

export interface KitchenCustomer {
  id: string;
  name: string;
  phone?: string;
}

export interface KitchenPayment {
  id: string;
  amount: number;
  paymentMethod: PaymentMethod | string;
  status?: string;
}

export interface KitchenDelivery {
  id: string;
  status: KitchenDeliveryStatus | string;
  deliveryPerson?: { id: string; name: string; phone?: string } | null;
  /** Observação da entrega, preenchida no checkout (ex.: "entregar na portaria"). */
  observations?: string | null;
}

export interface KitchenOrder {
  id: string;
  orderNumber?: number | string;
  status: KitchenStatus;
  observations?: string | null;
  totalValue?: number;
  /** Compõem o resumo financeiro do modal de detalhe. */
  discount?: number;
  totalShipping?: number;
  created_at: string;
  updated_at?: string;
  /** Quando entrou no `status` atual — referência do cronômetro da coluna. */
  statusChangedAt: string;
  fulfillmentType: KitchenFulfillmentType;
  /** Preenchido quando `status === "CANCELED"`. */
  cancelReason?: string | null;
  customer?: KitchenCustomer | null;
  orderedItems?: KitchenOrderItem[] | null;
  payments?: KitchenPayment[] | null;
  /** Só relevante quando `fulfillmentType === "DELIVERY"`; pode ser `null` antes da entrega ser criada. */
  delivery?: KitchenDelivery | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Envelope paginado — `{ data, meta }`, pedidos em `data`
// ─────────────────────────────────────────────────────────────────────────────

export interface KitchenPageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface KitchenOrdersPage {
  data: KitchenOrder[];
  meta: KitchenPageMeta;
}

// ─────────────────────────────────────────────────────────────────────────────
// Colunas do quadro
// ─────────────────────────────────────────────────────────────────────────────

export interface KitchenColumnConfig {
  status: KitchenStatus;
  /** Título da coluna em telas largas. */
  label: string;
  /** Rótulo curto dos cards de contador em telas estreitas. */
  shortLabel: string;
  /** Mensagem da coluna vazia. */
  emptyMessage: string;
  /** Próximo status via PATCH /order/:id/status. `null` encerra o fluxo. */
  nextStatus: KitchenWorkflowStatus | null;
  /** Rótulo do botão principal. `null` = coluna sem ação. */
  actionLabel: string | null;
  /** Oculta por padrão — só Cancelados; ligada por um botão no cabeçalho. */
  hiddenByDefault?: boolean;
  /** Tokens de cor, no mesmo vocabulário do /order-management. */
  tone: {
    header: string;
    body: string;
    text: string;
    badge: string;
    tab: string;
  };
}

export const KITCHEN_COLUMNS: KitchenColumnConfig[] = [
  {
    status: "ORDERED",
    label: "Novos",
    shortLabel: "Novos",
    emptyMessage: "Nenhum pedido novo",
    nextStatus: "IN_PRODUCTION",
    actionLabel: "Iniciar preparo",
    tone: {
      header: "bg-amber-100 dark:bg-amber-900 border-amber-200 dark:border-amber-800",
      body: "bg-amber-50/40 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800",
      text: "text-amber-800 dark:text-amber-300",
      badge: "bg-amber-500 text-white",
      tab: "data-[state=active]:bg-amber-100 dark:bg-amber-900 data-[state=active]:text-amber-800 dark:text-amber-300",
    },
  },
  {
    status: "IN_PRODUCTION",
    label: "Em preparo",
    shortLabel: "Preparo",
    emptyMessage: "Nada em preparo agora",
    nextStatus: "READY_FOR_PICKUP",
    actionLabel: "Marcar pronto",
    tone: {
      header: "bg-blue-100 dark:bg-blue-900 border-blue-200 dark:border-blue-800",
      body: "bg-blue-50/40 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800",
      text: "text-blue-800 dark:text-blue-300",
      badge: "bg-blue-500 text-white",
      tab: "data-[state=active]:bg-blue-100 dark:bg-blue-900 data-[state=active]:text-blue-800 dark:text-blue-300",
    },
  },
  {
    status: "READY_FOR_PICKUP",
    label: "Prontos",
    shortLabel: "Prontos",
    emptyMessage: "Nenhum pedido pronto",
    nextStatus: "COMPLETED",
    actionLabel: "Concluir",
    tone: {
      header: "bg-emerald-100 dark:bg-emerald-900 border-emerald-200 dark:border-emerald-800",
      body: "bg-emerald-50/40 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800",
      text: "text-emerald-800 dark:text-emerald-300",
      badge: "bg-emerald-500 text-white",
      tab: "data-[state=active]:bg-emerald-100 dark:bg-emerald-900 data-[state=active]:text-emerald-800 dark:text-emerald-300",
    },
  },
  {
    status: "COMPLETED",
    label: "Concluídos",
    shortLabel: "Feitos",
    emptyMessage: "Nenhum pedido concluído",
    nextStatus: null,
    actionLabel: null,
    tone: {
      header: "bg-slate-100 border-slate-200",
      body: "bg-slate-50/60 border-slate-200",
      text: "text-slate-700",
      badge: "bg-slate-500 text-white",
      tab: "data-[state=active]:bg-slate-200 data-[state=active]:text-slate-800",
    },
  },
  {
    status: "CANCELED",
    label: "Cancelados",
    shortLabel: "Cancelados",
    emptyMessage: "Nenhum pedido cancelado",
    nextStatus: null,
    actionLabel: null,
    hiddenByDefault: true,
    tone: {
      header: "bg-rose-100 dark:bg-rose-900 border-rose-200 dark:border-rose-800",
      body: "bg-rose-50/40 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800",
      text: "text-rose-800 dark:text-rose-300",
      badge: "bg-rose-500 text-white",
      tab: "data-[state=active]:bg-rose-100 dark:bg-rose-900 data-[state=active]:text-rose-800 dark:text-rose-300",
    },
  },
];

export const KITCHEN_COLUMN_BY_STATUS = KITCHEN_COLUMNS.reduce(
  (acc, column) => {
    acc[column.status] = column;
    return acc;
  },
  {} as Record<KitchenStatus, KitchenColumnConfig>,
);

/**
 * Concluídos e Cancelados são estados finais: paginam com "ver mais" em vez
 * de drenar tudo, e são os únicos que levam o filtro de período — sem isso
 * eles acumulariam o histórico inteiro da empresa. Novos/Em Preparo/Prontos
 * nunca aparecem aqui.
 */
export const PAGINATED_STATUSES: KitchenStatus[] = ["COMPLETED", "CANCELED"];

export const KITCHEN_PAGE_LIMIT = 20;

/** Namespace Socket.IO do gateway operacional (ver kitchen-orders.md). */
export const KITCHEN_SOCKET_NAMESPACE = "/orders";

/**
 * Fallback só usado quando o socket está caído — enquanto conectado, o quadro
 * vive dos eventos `orderCreated`/`orderStatusUpdated`.
 */
export const KITCHEN_FALLBACK_POLL_INTERVAL = 10_000;
export const KITCHEN_POLL_STAGGER = 600;

// ─────────────────────────────────────────────────────────────────────────────
// Estado por coluna, exposto pelo hook
// ─────────────────────────────────────────────────────────────────────────────

export interface KitchenColumnState {
  config: KitchenColumnConfig;
  orders: KitchenOrder[];
  /** Contador do cabeçalho — vem de `meta.total`, não de `orders.length`. */
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  /** Concluídos e Cancelados: existem mais páginas a carregar. */
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
  refetch: () => void;
}

export interface CancelTarget {
  order: KitchenOrder;
}

/** Erros da API traduzidos para a mensagem que o toast mostra. */
export interface KitchenApiErrorShape {
  status?: number;
  message: string;
}
