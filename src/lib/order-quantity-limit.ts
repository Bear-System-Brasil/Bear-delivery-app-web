/**
 * Teto de quantidade por pedido - solução TEMPORÁRIA só no front.
 *
 * O estoque era a única trava contra pedido absurdo, e o prato "sem
 * controle de estoque" (lib/unlimited-stock) tira essa trava. O teto de
 * verdade vai para o back no LDMF-333; até lá o front segura aqui. Quando o
 * back tiver o teto, este arquivo sai e o front só mostra a mensagem dele.
 *
 * Valores: hipóteses do PO registradas no LDMF-333. Vale para todos os
 * pratos, com ou sem controle de estoque.
 */

/** Máximo de unidades do mesmo prato no pedido (somando tamanhos). */
export const MAX_UNITS_PER_PRODUCT = 30;

/** Máximo de unidades no pedido inteiro. */
export const MAX_UNITS_PER_ORDER = 60;

export const PRODUCT_LIMIT_MESSAGE = `Para pedir mais de ${MAX_UNITS_PER_PRODUCT} unidades do mesmo prato, fale com o restaurante.`;

export const ORDER_LIMIT_MESSAGE = `Para pedidos com mais de ${MAX_UNITS_PER_ORDER} itens, fale com o restaurante.`;

interface LimitedItem {
  productId: string;
  quantity: number;
}

function unitsOfProduct(items: LimitedItem[], productId: string): number {
  return items
    .filter((item) => item.productId === productId)
    .reduce((total, item) => total + item.quantity, 0);
}

function totalUnits(items: LimitedItem[]): number {
  return items.reduce((total, item) => total + item.quantity, 0);
}

/**
 * Mensagem de bloqueio se somar `addedUnits` do prato ao carrinho passar do
 * teto; `null` se cabe.
 */
export function getQuantityLimitError(
  items: LimitedItem[],
  productId: string,
  addedUnits: number,
): string | null {
  if (addedUnits <= 0) return null;
  if (unitsOfProduct(items, productId) + addedUnits > MAX_UNITS_PER_PRODUCT) {
    return PRODUCT_LIMIT_MESSAGE;
  }
  if (totalUnits(items) + addedUnits > MAX_UNITS_PER_ORDER) {
    return ORDER_LIMIT_MESSAGE;
  }
  return null;
}

/**
 * Converte os itens do carrinho do back (`orderedItems`) para o formato do
 * teto. Item sem `productId` ou sem quantidade numérica fica de fora.
 */
export function toLimitedItems(orderedItems: unknown): LimitedItem[] {
  if (!Array.isArray(orderedItems)) return [];
  return orderedItems.flatMap((item) => {
    const productId = (item as { productId?: unknown })?.productId;
    const quantity = (item as { quantity?: unknown })?.quantity;
    return typeof productId === "string" && typeof quantity === "number"
      ? [{ productId, quantity }]
      : [];
  });
}

/**
 * Mensagem de bloqueio se o carrinho como está já passa do teto. Aceita o
 * carrinho da tela ou o `orderedItems` cru do back: item sem `productId` ou
 * sem quantidade numérica fica de fora.
 */
export function getCartLimitError(cartItems: unknown): string | null {
  const items = toLimitedItems(cartItems);
  const productIds = new Set(items.map((item) => item.productId));
  for (const productId of productIds) {
    if (unitsOfProduct(items, productId) > MAX_UNITS_PER_PRODUCT) {
      return PRODUCT_LIMIT_MESSAGE;
    }
  }
  if (totalUnits(items) > MAX_UNITS_PER_ORDER) return ORDER_LIMIT_MESSAGE;
  return null;
}
