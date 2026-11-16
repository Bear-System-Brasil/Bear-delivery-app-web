/**
 * Frete de vitrine antigo (R$ 99), que o front preenchia quando a API não
 * mandava `deliveryFee`. Desde o LDMF-534 o front calcula uma estimativa
 * (`resolveStoreDeliveryFee` em `@/lib/shipping-fee`) e não preenche mais
 * nada; o valor segue ignorado no carrinho e no checkout caso volte a
 * aparecer em dado antigo. O tempo de vitrine ("0-100 min") saiu: o back
 * não tem tempo de entrega antes do pedido.
 */
export const DEFAULT_DELIVERY_FEE = "99";
