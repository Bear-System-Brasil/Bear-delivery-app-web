import type { CustomerRef, Delivery, Order, OrderItem, Payment } from '@/services/api'

// ─────────────────────────────────────────────────────────────────────────────
// Types — Order com relações do Prisma retornadas por GET /order/company
// ─────────────────────────────────────────────────────────────────────────────

export interface CompanyOrderItem extends OrderItem {
  product?: {
    id: string
    name: string
    salePrice: number
  }
  /** Observação do prato em si (ex.: "sem cebola, bem passado") — distinta da de cada adicional/variação. */
  observations?: string | null
  addOns?: Array<{
    id: string
    quantity: number
    priceSnapshot: number
    /** Observação específica deste adicional (ex.: "bem crocante"). */
    observations?: string | null
    productAddOn?: { name?: string; description?: string }
    productAddOns?: { name?: string; description?: string }
    addOn?: { name?: string; description?: string }
    name?: string
    description?: string
  }>
  variations?: Array<{
    id: string
    priceSnapshot: number
    /** Observação específica desta variação (ex.: "sem pimenta"). */
    observations?: string | null
    variation?: { name?: string; description?: string }
    productVariation?: { name?: string; description?: string }
    name?: string
    description?: string
  }>
}

export interface CompanyOrder extends Omit<Order, 'orderedItems'> {
  orderNumber?: number
  cancelReason?: string
  customer?: CustomerRef
  orderedItems?: CompanyOrderItem[]
  payments?: Payment[]
  delivery?: {
    id: string
    status: string
    deliveryAddress?: Record<string, unknown>
    deliveryPerson?: {
      id: string
      name: string
      phone?: string
    }
    /** Observação da entrega, preenchida no checkout (ex.: "entregar na portaria"). */
    observations?: string | null
  } | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Types — Order com relações retornadas por GET /order/customer/me
// ─────────────────────────────────────────────────────────────────────────────

export interface CustomerOrder extends Order {
  delivery?: Pick<Delivery, 'status' | 'estimatedTime'>
}

// ─────────────────────────────────────────────────────────────────────────────
// Colunas do Kanban — baseadas em status de Order
// ─────────────────────────────────────────────────────────────────────────────

export type ColumnId = 'new' | 'preparing' | 'ready' | 'completed'

export interface ColumnConfig {
  id: ColumnId
  label: string
  description: string
  color: string
  bgColor: string
  borderColor: string
  badgeColor: string
  headerBg: string
  orderStatuses: string[]
}

export const COLUMNS: ColumnConfig[] = [
  {
    id: 'new',
    label: 'Novos',
    description: 'Aguardando início do preparo',
    color: 'text-amber-700 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/40',
    borderColor: 'border-amber-200 dark:border-amber-800',
    badgeColor: 'bg-amber-500',
    headerBg: 'bg-amber-100 dark:bg-amber-900',
    orderStatuses: ['ORDERED'],
  },
  {
    id: 'preparing',
    label: 'Em Preparo',
    description: 'Pedidos sendo preparados',
    color: 'text-blue-700 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950/40',
    borderColor: 'border-blue-200 dark:border-blue-800',
    badgeColor: 'bg-blue-500',
    headerBg: 'bg-blue-100 dark:bg-blue-900',
    orderStatuses: ['IN_PRODUCTION'],
  },
  {
    id: 'ready',
    label: 'Prontos',
    description: 'Prontos para retirada ou entrega',
    color: 'text-emerald-700 dark:text-emerald-400',
    bgColor: 'bg-emerald-50 dark:bg-emerald-950/40',
    borderColor: 'border-emerald-200 dark:border-emerald-800',
    badgeColor: 'bg-emerald-500',
    headerBg: 'bg-emerald-100 dark:bg-emerald-900',
    orderStatuses: ['READY_FOR_PICKUP'],
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Ações por coluna
// ─────────────────────────────────────────────────────────────────────────────

export interface ColumnAction {
  label: string
  nextStatus: string
}

export const COLUMN_ACTIONS: Record<ColumnId, ColumnAction | null> = {
  new: { label: 'Iniciar Preparo', nextStatus: 'IN_PRODUCTION' },
  preparing: { label: 'Marcar como Pronto', nextStatus: 'READY_FOR_PICKUP' },
  ready: { label: 'Marcar como Entregue', nextStatus: 'COMPLETED' },
  completed: null,
}

// ─────────────────────────────────────────────────────────────────────────────
// Motivos de cancelamento
// ─────────────────────────────────────────────────────────────────────────────

export const CANCEL_REASONS = [
  'Falta de estoque / Item indisponível',
  'Restaurante fechando / Fechamento antecipado',
  'Fora do raio de entrega',
  'Pedido duplicado',
  'Cliente solicitou cancelamento',
  'Tempo de espera muito longo',
  'Erro no pedido',
  'Outro',
] as const

// ─────────────────────────────────────────────────────────────────────────────
// Intervalo de polling
// ─────────────────────────────────────────────────────────────────────────────

export const ORDER_POLL_INTERVAL = 15_000

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function getColumnForOrder(order: CompanyOrder): ColumnId | 'canceled' {
  if (order.status === 'CANCELED') return 'canceled'
  if (order.status === 'COMPLETED') return 'completed'
  if (['CART', 'AWAITING_PAYMENT', 'ABANDONED'].includes(order.status)) return 'completed'

  for (const col of COLUMNS) {
    if (col.orderStatuses.includes(order.status)) {
      return col.id
    }
  }

  return 'completed'
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

export function getElapsedTime(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)

  if (minutes < 1) return 'Agora'
  if (hours > 0) return `${hours}h${minutes % 60 > 0 ? ` ${minutes % 60}min` : ''}`
  return `${minutes}min`
}

/**
 * Só lê `product.name`/`productId` — aceita qualquer item de pedido com essa
 * forma mínima (não só `CompanyOrderItem`), pra dar pra reusar em telas com
 * outro tipo de item de pedido (ex.: `/kitchen`).
 */
export function getOrderItemDisplayName(item: { productId: string; product?: { name: string } | null }): string {
  if (item.product?.name) return item.product.name
  return `Produto #${item.productId.slice(0, 6)}`
}

// Nome do adicional/variação pode vir aninhado de formas diferentes
// dependendo do include do backend em GET /order/company - o relation
// nested aqui só tem `.name` (não `.description`, que não existe em
// ProductAddOn/ProductVariation), então checar só `.description` como
// antes deixava o rótulo sempre caindo no genérico "Adicional"/"Variação".
// Mesma cadeia de fallback usada em use-cart-actions.ts para o carrinho.
//
// Tipado pela forma mínima que a função lê (todos os campos opcionais), não
// por `CompanyOrderItem['addOns']`, pra dar pra reusar com o item de pedido
// de outras telas (ex.: `/kitchen`) sem precisar bater 1:1 com esse tipo.
interface AddOnLabelSource {
  productAddOn?: { name?: string; description?: string } | null
  productAddOns?: { name?: string; description?: string } | null
  addOn?: { name?: string; description?: string } | null
  name?: string | null
  description?: string | null
}

export function getAddOnLabel(addon: AddOnLabelSource): string {
  return (
    addon.productAddOn?.name ||
    addon.productAddOns?.name ||
    addon.productAddOns?.description ||
    addon.addOn?.name ||
    addon.name ||
    addon.description ||
    'Adicional'
  )
}

/**
 * Prefixa a quantidade do adicional quando passa de 1 ("4x Morango").
 * Quantidade 1 (ou ausente) fica só com o nome. A quantidade é por unidade
 * do produto (ver order-item.md), igual ao que o cliente escolheu.
 */
export function withAddOnQuantity(name: string, quantity?: number | null): string {
  return quantity && quantity > 1 ? `${quantity}x ${name}` : name
}

interface VariationLabelSource {
  variation?: { name?: string; description?: string } | null
  productVariation?: { name?: string; description?: string } | null
  name?: string | null
  description?: string | null
}

export function getVariationLabel(variation: VariationLabelSource): string {
  return (
    variation.variation?.name ||
    variation.productVariation?.name ||
    variation.productVariation?.description ||
    variation.name ||
    variation.description ||
    'Variação'
  )
}

interface OrderItemTotalSource {
  quantity: number
  unitPrice?: number
  addOns?: Array<{ priceSnapshot?: number; quantity?: number }> | null
  variations?: Array<{ priceSnapshot?: number }> | null
}

/**
 * Total da linha do item, incluindo adicionais e variações - não só
 * `unitPrice × quantity` (ver order-item.md: o preço do complemento é
 * cobrado por unidade do produto, `quantity × addOn.quantity × priceSnapshot`).
 * Mesma fórmula de `use-cart-actions.ts`, reaplicada aqui pro item já
 * finalizado (cozinha/gestão de pedidos), que não passa pelo carrinho.
 */
export function getOrderItemTotal(item: OrderItemTotalSource): number {
  const addOnsTotal = (item.addOns ?? []).reduce(
    (sum, addOn) => sum + (addOn.priceSnapshot ?? 0) * (addOn.quantity ?? 1),
    0,
  )
  const variationsTotal = (item.variations ?? []).reduce(
    (sum, variation) => sum + (variation.priceSnapshot ?? 0),
    0,
  )

  return ((item.unitPrice ?? 0) + addOnsTotal + variationsTotal) * item.quantity
}

export function getPaymentMethodLabel(method?: string): string {
  const labels: Record<string, string> = {
    CASH: 'Dinheiro',
    CREDIT_CARD: 'Cartão de Crédito',
    DEBIT_CARD: 'Cartão de Débito',
    PIX: 'PIX',
    BANK_TRANSFER: 'Transferência',
  }
  return method ? labels[method] || method : 'Não informado'
}

export function getOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    ORDERED: 'Novo',
    IN_PRODUCTION: 'Em Preparo',
    READY_FOR_PICKUP: 'Pronto',
    COMPLETED: 'Concluído',
    CANCELED: 'Cancelado',
    CART: 'Carrinho',
    AWAITING_PAYMENT: 'Aguardando Pagamento',
    ABANDONED: 'Abandonado',
  }
  return labels[status] || status
}

interface MergeableItem {
  productId: string
  quantity: number
  unitPrice?: number
  observations?: string | null
  variations?: Array<
    VariationLabelSource & {
      productVariationId?: string
      priceSnapshot?: number
      observations?: string | null
    }
  > | null
  addOns?: Array<
    AddOnLabelSource & {
      productAddOnsId?: string
      quantity?: number
      priceSnapshot?: number
      observations?: string | null
    }
  > | null
}

/**
 * Chave que só bate quando duas linhas são o mesmo pedido de fato: mesmo
 * produto, preço, observação, tamanho e adicionais (com quantidade, preço e
 * observação de cada um). Usa os ids que a rota devolve
 * (`productVariationId`/`productAddOnsId`) e cai no nome se faltarem.
 */
function getMergeKey(item: MergeableItem): string {
  const variations = (item.variations ?? [])
    .map((v) =>
      [
        v.productVariationId ?? getVariationLabel(v),
        v.priceSnapshot ?? '',
        v.observations?.trim() ?? '',
      ].join('|'),
    )
    .sort()
  const addOns = (item.addOns ?? [])
    .map((a) =>
      [
        a.productAddOnsId ?? getAddOnLabel(a),
        a.quantity ?? 1,
        a.priceSnapshot ?? '',
        a.observations?.trim() ?? '',
      ].join('|'),
    )
    .sort()
  return JSON.stringify([
    item.productId,
    item.unitPrice ?? '',
    item.observations?.trim() ?? '',
    variations,
    addOns,
  ])
}

/**
 * Junta linhas idênticas do pedido somando a quantidade (3x + 3x do mesmo
 * Caldo 600ml com os mesmos adicionais viram 6x). Linhas com qualquer
 * diferença - outro tamanho, outro adicional, outra observação - continuam
 * separadas, porque a cozinha precisa delas. Mantém a ordem da primeira
 * aparição e o `id` da primeira linha do grupo.
 */
export function mergeIdenticalItems<T extends MergeableItem>(items: T[]): T[] {
  const merged = new Map<string, T>()
  for (const item of items) {
    const key = getMergeKey(item)
    const existing = merged.get(key)
    if (existing) merged.set(key, { ...existing, quantity: existing.quantity + item.quantity })
    else merged.set(key, item)
  }
  return [...merged.values()]
}
