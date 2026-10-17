import { describe, expect, it } from "vitest";
import {
  CART_EMPTY_ON_BACKEND_MESSAGE,
  CART_RESTAURANT_MISMATCH_MESSAGE,
  getCartRestaurantProblem,
} from "./cart-restaurant";

describe("getCartRestaurantProblem (LDMF-317)", () => {
  const item = (companyId?: string) => ({
    productId: "p",
    product: companyId === undefined ? {} : { companyId },
  });

  it("carrinho e itens da loja esperada: sem problema", () => {
    expect(
      getCartRestaurantProblem({ companyId: "A", orderedItems: [item("A")] }, "A"),
    ).toBeNull();
  });

  it("carrinho de outra loja: bloqueia", () => {
    expect(
      getCartRestaurantProblem({ companyId: "A", orderedItems: [item("B")] }, "B"),
    ).toBe(CART_RESTAURANT_MISMATCH_MESSAGE);
  });

  it("um item de outra loja no carrinho certo: bloqueia", () => {
    expect(
      getCartRestaurantProblem(
        { companyId: "A", orderedItems: [item("A"), item("B")] },
        "A",
      ),
    ).toBe(CART_RESTAURANT_MISMATCH_MESSAGE);
  });

  it("item sem companyId não bloqueia sozinho (campo opcional)", () => {
    expect(
      getCartRestaurantProblem({ companyId: "A", orderedItems: [item()] }, "A"),
    ).toBeNull();
  });

  it("carrinho vazio ou ausente: bloqueia", () => {
    expect(getCartRestaurantProblem({ companyId: "A", orderedItems: [] }, "A")).toBe(
      CART_EMPTY_ON_BACKEND_MESSAGE,
    );
    expect(getCartRestaurantProblem(null, "A")).toBe(CART_EMPTY_ON_BACKEND_MESSAGE);
  });
});
