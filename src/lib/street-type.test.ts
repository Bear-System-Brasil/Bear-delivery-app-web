import { describe, expect, it } from "vitest";

import { isSameStreet, joinStreet, splitStreet } from "./street-type";

describe("splitStreet", () => {
  it("separa tipo e nome, sem caixa e acento", () => {
    expect(splitStreet("Rua Sete de Setembro")).toEqual({
      type: "Rua",
      name: "Sete de Setembro",
    });
    expect(splitStreet("avenida Brasil")).toEqual({ type: "Avenida", name: "Brasil" });
    expect(splitStreet("Praca da Matriz")).toEqual({ type: "Praça", name: "da Matriz" });
  });

  it("reconhece abreviação com ponto", () => {
    expect(splitStreet("R. Machado de Assis")).toEqual({
      type: "Rua",
      name: "Machado de Assis",
    });
    expect(splitStreet("Av. Nossa Senhora da Penha").type).toBe("Avenida");
  });

  it("Av e R sem ponto também valem (é o jeito comum de digitar)", () => {
    expect(splitStreet("Av Brasil")).toEqual({ type: "Avenida", name: "Brasil" });
    expect(splitStreet("R Sete de Setembro")).toEqual({ type: "Rua", name: "Sete de Setembro" });
    expect(splitStreet("Trav São João").type).toBe("Travessa");
  });

  it("sem tipo no começo, tudo é nome", () => {
    expect(splitStreet("Sete de Setembro")).toEqual({
      type: null,
      name: "Sete de Setembro",
    });
    // "Al" sem ponto pode ser começo do nome.
    expect(splitStreet("Al Capone").type).toBeNull();
    expect(splitStreet("Ruanda")).toEqual({ type: null, name: "Ruanda" });
    expect(splitStreet("")).toEqual({ type: null, name: "" });
  });
});

describe("joinStreet", () => {
  it("põe o tipo na frente do nome", () => {
    expect(joinStreet("Rua", "Sete de Setembro")).toBe("Rua Sete de Setembro");
  });

  it("nunca repete o tipo", () => {
    expect(joinStreet("Rua", "Rua Sete de Setembro")).toBe("Rua Sete de Setembro");
    expect(joinStreet("Rua", "rua Sete de Setembro")).toBe("Rua Sete de Setembro");
  });

  it("tipo digitado no nome vale sobre o escolhido", () => {
    expect(joinStreet("Rua", "Avenida Brasil")).toBe("Avenida Brasil");
    expect(joinStreet("Rua", "Av. Brasil")).toBe("Avenida Brasil");
    expect(joinStreet("Rua", "Av Brasil")).toBe("Avenida Brasil");
  });

  it("nome vazio é rua vazia e o espaço do fim fica enquanto se digita", () => {
    expect(joinStreet("Rua", "")).toBe("");
    expect(joinStreet("Rua", "Rua ")).toBe("");
    expect(joinStreet("Rua", "Sete ")).toBe("Rua Sete ");
  });
});

describe("isSameStreet", () => {
  it("ignora caixa, acento e espaço repetido", () => {
    expect(isSameStreet("Avenida Nossa Senhora da Penha", "avenida nossa  senhora da penha")).toBe(true);
    expect(isSameStreet("Rua Antônio Machado", "Rua Antonio Machado")).toBe(true);
    expect(isSameStreet("Rua A", "Avenida A")).toBe(false);
  });
});
