/**
 * Conferência de loja do carrinho (LDMF-317).
 *
 * O carrinho do backend é um por cliente (`cart:<userId>`) e grava a loja
 * uma vez, na criação. O backend aceita produto de outra loja nesse
 * carrinho e finaliza o pedido na loja do carrinho - foi assim que um
 * pedido de hambúrguer caiu na sorveteria. Até o backend ganhar a trava
 * própria (LDMF-347), o front confere antes de finalizar.
 */

/**
 * Formato lido de GET /order/cart:<userId>. `product.companyId` foi
 * observado na resposta real (15/10), mas fica opcional: sem ele, a
 * conferência por item é pulada em vez de bloquear o pedido.
 */
export interface CartRestaurantSnapshot {
  companyId?: string;
  orderedItems?: { productId: string; product?: { companyId?: string } }[];
}

export const CART_RESTAURANT_MISMATCH_MESSAGE =
  "Seu carrinho tem itens de outra loja. Revise o carrinho antes de finalizar o pedido.";

export const CART_EMPTY_ON_BACKEND_MESSAGE =
  "Não encontramos os itens do seu carrinho. Volte ao carrinho e adicione os itens novamente.";

/**
 * Devolve o motivo para bloquear a finalização, ou null quando o carrinho
 * do backend é todo da loja esperada.
 */
export function getCartRestaurantProblem(
  cart: CartRestaurantSnapshot | null | undefined,
  expectedRestaurantId: string,
): string | null {
  const items = cart?.orderedItems ?? [];
  if (!cart || items.length === 0) return CART_EMPTY_ON_BACKEND_MESSAGE;

  if (cart.companyId && cart.companyId !== expectedRestaurantId) {
    return CART_RESTAURANT_MISMATCH_MESSAGE;
  }

  const cartRestaurantId = cart.companyId || expectedRestaurantId;
  const hasForeignItem = items.some(
    (item) =>
      item.product?.companyId !== undefined &&
      item.product.companyId !== cartRestaurantId,
  );

  return hasForeignItem ? CART_RESTAURANT_MISMATCH_MESSAGE : null;
}
