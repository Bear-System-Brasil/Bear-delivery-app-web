/**
 * Agrupamento e ordenação do cardápio, compartilhado entre a tela do cliente
 * (restaurant-info) e a prévia no admin (category-management), pra os dois não
 * divergirem (LDMF-454). Função pura: fácil de testar.
 */
import type { Product } from "@/services/api";
import type { ProductCategory } from "@/types/restaurant";

export function slugify(text: string) {
  if (!text) return "";
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // Remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // Troca espaços e caracteres especiais por hífen
    .replace(/(^-|-$)+/g, ""); // Remove hifens sobrando nas pontas
}

export function getProductCategoryName(
  productCategory: ProductCategory | string | undefined,
  categoryMap: Record<string, string>,
) {
  if (typeof productCategory === "string") {
    return categoryMap[productCategory] || productCategory;
  }

  return (
    categoryMap[productCategory?.categoryId ?? ""] ||
    productCategory?.category?.name ||
    ""
  );
}

export function getImageUrl(item: Product) {
  return item.imageURL?.[0]?.url || "/placeholder.svg";
}

export interface GroupedMenu {
  /** Produtos agrupados pelo nome da primeira categoria (ou "Outros"). */
  groupedItems: Record<string, Product[]>;
  /** Categorias visíveis (com ao menos um item disponível), já ordenadas. */
  categories: string[];
  /** Menor position vista por nome de categoria (do back, LDMF-345). */
  categoryPositionByName: Record<string, number>;
}

/**
 * Agrupa os produtos por categoria e devolve as categorias visíveis ordenadas.
 *
 * - Categoria 100% indisponível some (o lojista "esconde" deixando os itens
 *   indisponíveis — LDMF-442). Item indisponível avulso continua no grupo.
 * - Ordem padrão: pela `position` que o back manda em cada produto (LDMF-345);
 *   "Outros" e categorias sem position vão pro fim.
 * - `options.categoryOrder` (nomes) força uma ordem explícita — usado pela
 *   prévia do admin pra refletir o rascunho da reordenação ao vivo. O que não
 *   estiver na lista vai pro fim, preservando a ordem relativa.
 */
export function groupMenuByCategory(
  menuItems: Product[],
  categoryMap: Record<string, string>,
  options?: { categoryOrder?: string[] },
): GroupedMenu {
  const groupedItems: Record<string, Product[]> = {};
  menuItems.forEach((item) => {
    let catName = "Outros";
    const firstPc = item.productCategories?.[0];
    if (firstPc) {
      const found = getProductCategoryName(firstPc, categoryMap);
      if (found) catName = found;
    }
    if (!groupedItems[catName]) groupedItems[catName] = [];
    groupedItems[catName].push(item);
  });

  const categoryPositionByName: Record<string, number> = {};
  menuItems.forEach((item) => {
    const first = item.productCategories?.[0];
    if (!first || typeof first === "string") return;
    const name = getProductCategoryName(first, categoryMap);
    const position = first.category?.position;
    if (name && typeof position === "number") {
      categoryPositionByName[name] =
        name in categoryPositionByName
          ? Math.min(categoryPositionByName[name], position)
          : position;
    }
  });

  const visible = Object.keys(groupedItems).filter((catName) =>
    groupedItems[catName].some((item) => item.isAvailable !== false),
  );

  const order = options?.categoryOrder;
  const categories = order
    ? [...visible].sort((a, b) => {
        const ia = order.indexOf(a);
        const ib = order.indexOf(b);
        if (ia === -1 && ib === -1) return 0;
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
      })
    : [...visible].sort((a, b) => {
        if (a === "Outros") return 1;
        if (b === "Outros") return -1;
        const pa = categoryPositionByName[a];
        const pb = categoryPositionByName[b];
        if (pa === undefined && pb === undefined) return 0;
        if (pa === undefined) return 1;
        if (pb === undefined) return -1;
        return pa - pb;
      });

  return { groupedItems, categories, categoryPositionByName };
}
