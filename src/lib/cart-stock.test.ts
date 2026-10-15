import { describe, expect, it } from "vitest";
import { getCartItemStock, getCartStockIssues } from "./cart-stock";
import type { Product, ProductVariation } from "@/services/api";
import type { CartItem } from "@/stores/cart-store";

const mockItem = (overrides: Partial<CartItem> = {}): CartItem =>
  ({
    id: "item-1",
    productId: "prod-1",
    name: "Hambúrguer",
    price: 30,
    quantity: 1,
    restaurantId: "comp-1",
    restaurantName: "Lanchonete",
    ...overrides,
  }) as CartItem;

const mockProduct = (overrides: Partial<Product> = {}): Product =>
  ({
    id: "prod-1",
    name: "Hambúrguer",
    description: "Delicioso",
    salePrice: 30,
    isAvailable: true,
    companyId: "comp-1",
    stockQuantity: 10,
    ...overrides,
  }) as Product;

const mockVariation = (
  overrides: Partial<ProductVariation> = {},
): ProductVariation =>
  ({
    id: "var-1",
    productId: "prod-1",
    name: "Grande",
    priceModifier: 5,
    isAvailable: true,
    stockQuantity: 5,
    created_at: "",
    updated_at: "",
    ...overrides,
  }) as ProductVariation;

describe("cart-stock - getCartItemStock", () => {
  describe("quando listas estão vazias", () => {
    it("não marca como sem estoque se listas ainda não carregaram", () => {
      const item = mockItem({ variations: [{ productVariationId: "var-1" }] });
      const status = getCartItemStock(item, [], []);
      expect(status.isOutOfStock).toBe(false);
      expect(status.exceedsStock).toBe(false);
    });
  });

  describe("item com variação", () => {
    it("retorna estoque disponível da variação", () => {
      const item = mockItem({
        quantity: 2,
        variations: [{ productVariationId: "var-1" }],
      });
      const variation = mockVariation({ id: "var-1", stockQuantity: 5 });

      const status = getCartItemStock(item, [], [variation]);
      expect(status.isOutOfStock).toBe(false);
      expect(status.exceedsStock).toBe(false);
      expect(status.availableStock).toBe(5);
    });

    it("marca como esgotado se variação está com estoque zero", () => {
      const item = mockItem({
        quantity: 1,
        variations: [{ productVariationId: "var-1" }],
      });
      const variation = mockVariation({ id: "var-1", stockQuantity: 0 });

      const status = getCartItemStock(item, [], [variation]);
      expect(status.isOutOfStock).toBe(true);
      expect(status.availableStock).toBe(0);
    });

    it("marca como esgotado se variação está indisponível", () => {
      const item = mockItem({
        quantity: 1,
        variations: [{ productVariationId: "var-1" }],
      });
      const variation = mockVariation({
        id: "var-1",
        isAvailable: false,
        stockQuantity: 10,
      });

      const status = getCartItemStock(item, [], [variation]);
      expect(status.isOutOfStock).toBe(true);
      expect(status.availableStock).toBe(0);
    });

    it("marca como esgotado se variação não existe mais na lista", () => {
      const item = mockItem({
        quantity: 1,
        variations: [{ productVariationId: "var-excluida" }],
      });
      const variation = mockVariation({ id: "var-outra" });

      const status = getCartItemStock(item, [], [variation]);
      expect(status.isOutOfStock).toBe(true);
      expect(status.availableStock).toBe(0);
    });

    it("detecta quando quantidade no carrinho excede estoque da variação", () => {
      const item = mockItem({
        quantity: 4,
        variations: [{ productVariationId: "var-1" }],
      });
      const variation = mockVariation({ id: "var-1", stockQuantity: 2 });

      const status = getCartItemStock(item, [], [variation]);
      expect(status.isOutOfStock).toBe(false);
      expect(status.exceedsStock).toBe(true);
      expect(status.availableStock).toBe(2);
    });
  });

  describe("prato simples (sem variação)", () => {
    it("retorna estoque do produto", () => {
      const item = mockItem({ quantity: 2 });
      const product = mockProduct({ stockQuantity: 10 });

      const status = getCartItemStock(item, [product], []);
      expect(status.isOutOfStock).toBe(false);
      expect(status.exceedsStock).toBe(false);
      expect(status.availableStock).toBe(10);
    });

    it("marca como esgotado se prato simples está com estoque zero", () => {
      const item = mockItem({ quantity: 1 });
      const product = mockProduct({ stockQuantity: 0 });

      const status = getCartItemStock(item, [product], []);
      expect(status.isOutOfStock).toBe(true);
      expect(status.availableStock).toBe(0);
    });

    it("marca como esgotado se prato simples está indisponível", () => {
      const item = mockItem({ quantity: 1 });
      const product = mockProduct({ isAvailable: false, stockQuantity: 10 });

      const status = getCartItemStock(item, [product], []);
      expect(status.isOutOfStock).toBe(true);
      expect(status.availableStock).toBe(0);
    });

    it("marca como esgotado se prato foi removido", () => {
      const item = mockItem({ productId: "prod-inexistente" });
      const product = mockProduct({ id: "prod-outro" });

      const status = getCartItemStock(item, [product], []);
      expect(status.isOutOfStock).toBe(true);
      expect(status.availableStock).toBe(0);
    });

    it("detecta quando quantidade no carrinho excede estoque do prato simples", () => {
      const item = mockItem({ quantity: 5 });
      const product = mockProduct({ stockQuantity: 3 });

      const status = getCartItemStock(item, [product], []);
      expect(status.isOutOfStock).toBe(false);
      expect(status.exceedsStock).toBe(true);
      expect(status.availableStock).toBe(3);
    });
  });
});

describe("cart-stock - getCartStockIssues", () => {
  it("informa hasIssues: false quando todos os itens estão regulares", () => {
    const item1 = mockItem({ id: "l1", productId: "p1", quantity: 2 });
    const product1 = mockProduct({ id: "p1", stockQuantity: 5 });

    const result = getCartStockIssues([item1], [product1], []);
    expect(result.hasIssues).toBe(false);
    expect(result.itemIssues.get("l1")?.isOutOfStock).toBe(false);
  });

  it("informa hasIssues: true quando há item esgotado ou excedendo estoque", () => {
    const item1 = mockItem({ id: "l1", productId: "p1", quantity: 2 });
    const item2 = mockItem({ id: "l2", productId: "p2", quantity: 3 });

    const product1 = mockProduct({ id: "p1", stockQuantity: 5 });
    const product2 = mockProduct({ id: "p2", stockQuantity: 0 }); // esgotado

    const result = getCartStockIssues([item1, item2], [product1, product2], []);
    expect(result.hasIssues).toBe(true);
    expect(result.itemIssues.get("l1")?.isOutOfStock).toBe(false);
    expect(result.itemIssues.get("l2")?.isOutOfStock).toBe(true);
  });
});

