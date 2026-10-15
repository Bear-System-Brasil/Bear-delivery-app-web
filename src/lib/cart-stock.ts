import type { Product, ProductVariation } from "@/services/api";
import type { CartItem } from "@/stores/cart-store";

export interface CartItemStockStatus {
  /** Se o item está completamente sem estoque ou indisponível */
  isOutOfStock: boolean;
  /** Se a quantidade no carrinho excede o estoque disponível */
  exceedsStock: boolean;
  /** Estoque máximo disponível para este item (undefined quando desconhecido/ilimitado) */
  availableStock?: number;
}

export interface CartStockCheckResult {
  /** Mapeamento de id da linha do carrinho -> status de estoque */
  itemIssues: Map<string, CartItemStockStatus>;
  /** Verdadeiro se qualquer item estiver sem estoque ou excedendo o estoque */
  hasIssues: boolean;
}

/**
 * Calcula o estoque disponível e status de um item específico do carrinho.
 */
export function getCartItemStock(
  item: CartItem,
  companyProducts: Product[] = [],
  companyVariations: ProductVariation[] = [],
): CartItemStockStatus {
  const variationId = item.variations?.[0]?.productVariationId;

  // 1. Item com variação/tamanho
  if (variationId) {
    if (companyVariations.length === 0) {
      // Lista de variações ainda não carregou ou não informada
      return { isOutOfStock: false, exceedsStock: false };
    }

    const variation = companyVariations.find((v) => v.id === variationId);
    if (!variation || !variation.isAvailable) {
      return { isOutOfStock: true, exceedsStock: false, availableStock: 0 };
    }

    const stock = variation.stockQuantity ?? 0;
    const isOutOfStock = stock <= 0;
    const exceedsStock = !isOutOfStock && item.quantity > stock;

    return {
      isOutOfStock,
      exceedsStock,
      availableStock: stock,
    };
  }

  // 2. Prato simples (sem variação de tamanho)
  if (companyProducts.length === 0) {
    // Lista de produtos ainda não carregou ou não informada
    return { isOutOfStock: false, exceedsStock: false };
  }

  const product = companyProducts.find((p) => p.id === item.productId);
  if (!product || product.isAvailable === false) {
    return { isOutOfStock: true, exceedsStock: false, availableStock: 0 };
  }

  if (product.stockQuantity !== undefined) {
    const stock = product.stockQuantity;
    const isOutOfStock = stock <= 0;
    const exceedsStock = !isOutOfStock && item.quantity > stock;

    return {
      isOutOfStock,
      exceedsStock,
      availableStock: stock,
    };
  }

  // Se stockQuantity for undefined no prato simples, estoque é ilimitado/não controlado
  return {
    isOutOfStock: false,
    exceedsStock: false,
  };
}

/**
 * Valida o estoque de todos os itens do carrinho contra os dados atualizados
 * da loja (produtos e variações).
 */
export function getCartStockIssues(
  items: CartItem[],
  companyProducts: Product[] = [],
  companyVariations: ProductVariation[] = [],
): CartStockCheckResult {
  const itemIssues = new Map<string, CartItemStockStatus>();
  let hasIssues = false;

  for (const item of items) {
    const status = getCartItemStock(item, companyProducts, companyVariations);
    itemIssues.set(item.id, status);

    if (status.isOutOfStock || status.exceedsStock) {
      hasIssues = true;
    }
  }

  return {
    itemIssues,
    hasIssues,
  };
}

