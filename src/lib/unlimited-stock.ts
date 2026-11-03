/**
 * Estoque "não controlado" resolvido só no front.
 *
 * O back ainda não tem a opção de a loja trabalhar sem estoque: a API de
 * prato e de tamanho exige um número e a finalização do pedido desconta e
 * barra quando acaba. Para quem não controla estoque, gravamos um número
 * irreal (UNLIMITED_STOCK) e o front trata qualquer valor a partir de
 * UNLIMITED_STOCK_THRESHOLD como "sem controle": não mostra a quantidade,
 * não limita o carrinho e não conta como estoque esgotado.
 *
 * O back desconta 1 por unidade vendida, então o valor gravado desce aos
 * poucos - por isso o corte é bem abaixo do valor gravado.
 *
 * Quando o back ganhar o controle de estoque de verdade, este arquivo é o
 * ponto único a trocar.
 */

/** Valor gravado quando a loja marca "Não controlo estoque". */
export const UNLIMITED_STOCK = 999_999_999;

/** A partir daqui o número é considerado irreal = estoque não controlado. */
export const UNLIMITED_STOCK_THRESHOLD = 100_000_000;

/**
 * `null`/`undefined` também contam como não controlado: é o que o back faz
 * na finalização do pedido com prato e complemento sem estoque gravado.
 */
export function isUnlimitedStock(stock: number | null | undefined): boolean {
  return stock == null || stock >= UNLIMITED_STOCK_THRESHOLD;
}

/**
 * Estoque a reenviar para o back numa edição que não mexe no estoque (ex.:
 * ligar/desligar disponibilidade). A API exige número: estoque não
 * controlado (inclusive vazio) volta como UNLIMITED_STOCK, nunca como 0 -
 * 0 deixaria o prato esgotado.
 */
export function stockForResave(stock: number | null | undefined): number {
  return isUnlimitedStock(stock) ? UNLIMITED_STOCK : (stock as number);
}
