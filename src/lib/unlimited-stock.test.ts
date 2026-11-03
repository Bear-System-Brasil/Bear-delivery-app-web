import { describe, expect, it } from "vitest";
import {
  isUnlimitedStock,
  stockForResave,
  UNLIMITED_STOCK,
  UNLIMITED_STOCK_THRESHOLD,
} from "./unlimited-stock";

describe("unlimited-stock", () => {
  it("o valor gravado fica acima do corte", () => {
    expect(UNLIMITED_STOCK).toBeGreaterThan(UNLIMITED_STOCK_THRESHOLD);
  });

  it("número irreal conta como sem controle, mesmo depois de vendas", () => {
    expect(isUnlimitedStock(UNLIMITED_STOCK)).toBe(true);
    expect(isUnlimitedStock(UNLIMITED_STOCK - 5000)).toBe(true);
    expect(isUnlimitedStock(UNLIMITED_STOCK_THRESHOLD)).toBe(true);
  });

  it("vazio conta como sem controle", () => {
    expect(isUnlimitedStock(null)).toBe(true);
    expect(isUnlimitedStock(undefined)).toBe(true);
  });

  it("estoque real, inclusive 0, é controlado", () => {
    expect(isUnlimitedStock(0)).toBe(false);
    expect(isUnlimitedStock(15)).toBe(false);
    expect(isUnlimitedStock(UNLIMITED_STOCK_THRESHOLD - 1)).toBe(false);
  });

  describe("stockForResave", () => {
    it("mantém estoque real, inclusive 0", () => {
      expect(stockForResave(0)).toBe(0);
      expect(stockForResave(12)).toBe(12);
    });

    it("vazio e sem controle voltam como o número irreal, nunca 0", () => {
      expect(stockForResave(null)).toBe(UNLIMITED_STOCK);
      expect(stockForResave(undefined)).toBe(UNLIMITED_STOCK);
      expect(stockForResave(UNLIMITED_STOCK - 3)).toBe(UNLIMITED_STOCK);
    });
  });
});
