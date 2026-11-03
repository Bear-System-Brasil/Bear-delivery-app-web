import { describe, expect, it } from "vitest";
import type { Product } from "@/services/api";
import { getImageUrl, groupMenuByCategory, slugify } from "./menu-grouping";

const catMap: Record<string, string> = {
  c1: "Pizzas",
  c2: "Bebidas",
  c3: "Sobremesas",
};

function prod(
  id: string,
  catId: string | null,
  position: number | null,
  available = true,
): Product {
  return {
    id,
    name: `Produto ${id}`,
    salePrice: 10,
    isAvailable: available,
    productCategories: catId
      ? [
          {
            categoryId: catId,
            category: {
              id: catId,
              name: catMap[catId],
              ...(position !== null ? { position } : {}),
            },
          },
        ]
      : [],
  } as unknown as Product;
}

describe("groupMenuByCategory", () => {
  it("agrupa pelo nome da categoria e cai em 'Outros' sem categoria", () => {
    const { groupedItems } = groupMenuByCategory(
      [prod("1", "c1", 0), prod("2", null, null)],
      catMap,
    );
    expect(groupedItems["Pizzas"].map((p) => p.id)).toEqual(["1"]);
    expect(groupedItems["Outros"].map((p) => p.id)).toEqual(["2"]);
  });

  it("esconde categoria 100% indisponível, mas mantém item indisponível avulso", () => {
    const { categories, groupedItems } = groupMenuByCategory(
      [prod("1", "c1", 0, true), prod("2", "c1", 0, false)],
      catMap,
    );
    // Pizzas tem um disponível: fica visível, com os dois itens no grupo.
    expect(categories).toContain("Pizzas");
    expect(groupedItems["Pizzas"].map((p) => p.id)).toEqual(["1", "2"]);

    // Bebidas só tem indisponível: some das categorias visíveis.
    const soIndisponivel = groupMenuByCategory(
      [prod("3", "c2", 1, false)],
      catMap,
    );
    expect(soIndisponivel.categories).not.toContain("Bebidas");
  });

  it("ordena pela position do back; 'Outros' e sem position vão pro fim", () => {
    const { categories } = groupMenuByCategory(
      [
        prod("1", "c2", 2),
        prod("2", "c1", 0),
        prod("3", "c3", 1),
        prod("4", null, null), // Outros
        prod("5", "c1", null), // Pizzas sem position (mas c1 já tem via "2")
      ],
      catMap,
    );
    expect(categories).toEqual(["Pizzas", "Sobremesas", "Bebidas", "Outros"]);
  });

  it("categoryOrder força a ordem (rascunho do admin); fora da lista vai pro fim", () => {
    const { categories } = groupMenuByCategory(
      [prod("1", "c1", 0), prod("2", "c2", 1), prod("3", "c3", 2)],
      catMap,
      { categoryOrder: ["Bebidas", "Pizzas"] },
    );
    expect(categories).toEqual(["Bebidas", "Pizzas", "Sobremesas"]);
  });
});

describe("helpers", () => {
  it("slugify remove acentos e normaliza", () => {
    expect(slugify("Pizzas Salgadas")).toBe("pizzas-salgadas");
    expect(slugify("Bebidas & Sucos")).toBe("bebidas-sucos");
    expect(slugify("Ação")).toBe("acao");
  });

  it("getImageUrl usa a primeira imagem ou o placeholder", () => {
    expect(
      getImageUrl({
        imageURL: [{ url: "https://x/img.png" }],
      } as unknown as Product),
    ).toBe("https://x/img.png");
    expect(getImageUrl({} as unknown as Product)).toBe("/placeholder.svg");
  });
});
