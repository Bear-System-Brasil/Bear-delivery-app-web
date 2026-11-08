import { describe, expect, it } from "vitest";
import {
  getCartLimitError,
  getQuantityLimitError,
  MAX_UNITS_PER_ORDER,
  MAX_UNITS_PER_PRODUCT,
  ORDER_LIMIT_MESSAGE,
  PRODUCT_LIMIT_MESSAGE,
} from "./order-quantity-limit";

const item = (productId: string, quantity: number) => ({ productId, quantity });

describe("order-quantity-limit", () => {
  it("deixa adicionar até o teto do prato", () => {
    expect(
      getQuantityLimitError([item("p1", 20)], "p1", MAX_UNITS_PER_PRODUCT - 20),
    ).toBeNull();
  });

  it("barra passar do teto do prato, somando os tamanhos", () => {
    // dois tamanhos do mesmo prato são linhas diferentes no carrinho
    const cart = [item("p1", 15), item("p1", 14)];
    expect(getQuantityLimitError(cart, "p1", 2)).toBe(PRODUCT_LIMIT_MESSAGE);
  });

  it("barra passar do teto do pedido mesmo com pratos diferentes", () => {
    const cart = [item("p1", 30), item("p2", 29)];
    expect(getQuantityLimitError(cart, "p3", 2)).toBe(ORDER_LIMIT_MESSAGE);
    expect(getQuantityLimitError(cart, "p3", 1)).toBeNull();
  });

  it("diminuir não é barrado", () => {
    expect(getQuantityLimitError([item("p1", 40)], "p1", 0)).toBeNull();
  });

  it("carrinho acima do teto não passa para o checkout", () => {
    expect(getCartLimitError([item("p1", MAX_UNITS_PER_PRODUCT + 1)])).toBe(
      PRODUCT_LIMIT_MESSAGE,
    );
    expect(
      getCartLimitError([
        item("p1", 30),
        item("p2", 30),
        item("p3", MAX_UNITS_PER_ORDER - 60 + 1),
      ]),
    ).toBe(ORDER_LIMIT_MESSAGE);
    expect(getCartLimitError([item("p1", 30), item("p2", 30)])).toBeNull();
  });
});
