import { describe, expect, it } from "vitest";
import type { Specialty } from "@/services/api";
import { dedupeSpecialties, specialtyNameKey } from "./specialty-dedupe";

function spec(id: string, name: string): Specialty {
  return {
    id,
    name,
    description: "",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

// Lista no formato da tela do Perfil (print do LDMF-497).
const lista = [
  spec("h1", "Hambúrgueres"),
  spec("h2", "Hambúrgueres"),
  spec("l1", "Lanches"),
  spec("b1", "Brasileira"),
  spec("be1", "Bebidas"),
  spec("s1", "Saladas"),
  spec("a1", "Árabe"),
  spec("b2", "Brasileira"),
  spec("h3", "Hambúrgueres"),
  spec("j1", "Japonesa"),
  spec("be2", "BeBidas"),
];

describe("specialtyNameKey", () => {
  it("ignora maiúscula, acento e espaço sobrando", () => {
    expect(specialtyNameKey("BeBidas")).toBe("bebidas");
    expect(specialtyNameKey("  Hambúrgueres ")).toBe("hamburgueres");
    expect(specialtyNameKey("Comida   Árabe")).toBe("comida arabe");
    expect(specialtyNameKey(undefined)).toBe("");
  });
});

describe("dedupeSpecialties", () => {
  it("mostra cada nome uma vez, na ordem da primeira aparição", () => {
    expect(dedupeSpecialties(lista).map((s) => s.name)).toEqual([
      "Hambúrgueres",
      "Lanches",
      "Brasileira",
      "Bebidas",
      "Saladas",
      "Árabe",
      "Japonesa",
    ]);
  });

  it("sem escolha salva, o primeiro cadastro representa o nome", () => {
    const ids = dedupeSpecialties(lista).map((s) => s.id);
    expect(ids).toContain("h1");
    expect(ids).toContain("be1");
    expect(ids).not.toContain("h2");
    expect(ids).not.toContain("be2");
  });

  it("mantém o id que a loja já tem salvo, na posição do nome", () => {
    const result = dedupeSpecialties(lista, ["h3", "be2", ""]);
    expect(result[0]).toEqual(spec("h3", "Hambúrgueres"));
    expect(result[3]).toEqual(spec("be2", "BeBidas"));
    expect(result.map((s) => s.id)).not.toContain("h1");
  });

  it("deixa de fora tipo sem nome", () => {
    expect(dedupeSpecialties([spec("x", "  "), spec("y", "Doces")])).toEqual([
      spec("y", "Doces"),
    ]);
  });
});
