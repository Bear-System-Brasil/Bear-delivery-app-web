import { stockForResave } from "@/lib/unlimited-stock";
import { apiService, type Product, type ProductImage } from "@/services/api";
import { getErrorMessage } from "@/utils";
import { uploadProductImageSafe } from "./upload-product-image";

/**
 * Duplicação de prato (LDMF-489), feita só no front: o back não tem rota de
 * duplicar, então a cópia é montada com as mesmas chamadas da criação de
 * prato (prato, categoria, tamanhos, complementos e fotos).
 *
 * Ordem pensada para não deixar cópia pela metade quando dá para evitar:
 * tamanhos, complementos e fotos do original são lidos ANTES de criar o
 * prato. Se a leitura falha, nada é criado. Depois de criado, falha em
 * categoria, tamanho, complemento ou foto não desfaz a cópia: vira aviso.
 */

/** Mesmo limite da validação do formulário do prato. */
export const DISH_NAME_MAX_LENGTH = 80;

const COPY_SUFFIX = /\s*\(cópia(?: \d+)?\)$/i;

/**
 * "Pizza" -> "Pizza (cópia)", depois "Pizza (cópia 2)", "Pizza (cópia 3)"...
 * Duplicar uma cópia não empilha sufixo: "Pizza (cópia)" vira
 * "Pizza (cópia 2)". Corta o nome base para caber nos 80 caracteres.
 */
export function buildCopyName(name: string, existingNames: string[]): string {
  const trimmed = name.trim();
  const base = trimmed.replace(COPY_SUFFIX, "").trim() || trimmed;
  const taken = new Set(existingNames.map((n) => n.trim().toLowerCase()));

  for (let index = 1; ; index += 1) {
    const suffix = index === 1 ? " (cópia)" : ` (cópia ${index})`;
    const candidate =
      base.slice(0, DISH_NAME_MAX_LENGTH - suffix.length).trimEnd() + suffix;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

function imageUrlOf(image: ProductImage | string): string {
  return typeof image === "string" ? image : image?.url;
}

function fileNameFromUrl(url: string, index: number, type: string) {
  const last = url.split("?")[0].split("/").pop();
  if (last && /\.[a-z0-9]+$/i.test(last)) return last;
  const extension = type.split("/")[1] || "jpg";
  return `foto-${index + 1}.${extension}`;
}

/**
 * Baixa as fotos do original pela rota do servidor (o navegador não
 * consegue baixar direto do R2/S3). Tudo ou nada: se uma foto falha, a
 * cópia sai sem foto nenhuma, como combinado no card.
 */
async function downloadImages(images: (ProductImage | string)[]) {
  const files: File[] = [];
  for (const [index, image] of images.entries()) {
    const url = imageUrlOf(image);
    if (!url || url.startsWith("blob:")) continue;

    const response = await fetch(
      `/api/product-image/download?url=${encodeURIComponent(url)}`,
      { cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(`Erro ${response.status} ao baixar a foto`);
    }
    const blob = await response.blob();
    files.push(
      new File([blob], fileNameFromUrl(url, index, blob.type), {
        type: blob.type,
      }),
    );
  }
  return files;
}

function unwrapProduct(raw: unknown): Product | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id === "string") return raw as Product;
  const nested = obj.data as Record<string, unknown> | undefined;
  if (nested && typeof nested.id === "string") {
    return nested as unknown as Product;
  }
  return null;
}

/** Roda a chamada e devolve a mensagem de erro, ou null se deu certo. */
async function attempt(
  call: () => Promise<{ success: boolean; message?: string }>,
): Promise<string | null> {
  try {
    const response = await call();
    return response.success ? null : response.message || "Erro ao salvar";
  } catch (error) {
    return getErrorMessage(error, "Erro ao salvar");
  }
}

export interface DuplicateProductResult {
  product: Product;
  /** Partes que não foram copiadas. A cópia existe mesmo assim. */
  warnings: string[];
}

export async function duplicateProduct({
  source,
  companyId,
  existingNames,
}: {
  source: Product;
  companyId: string | null;
  existingNames: string[];
}): Promise<DuplicateProductResult> {
  // Painel da empresa sempre recebe costPrice; sem ele não dá para criar
  // e mandar 0 inventaria um preço que o lojista não digitou.
  if (typeof source.costPrice !== "number") {
    throw new Error("Não deu para ler o preço de custo do prato original.");
  }

  const [variationsResponse, addOnsResponse] = await Promise.all([
    apiService.productVariations.getAll(companyId ?? undefined),
    apiService.productAddOns.getAll(companyId ?? undefined),
  ]);
  if (!variationsResponse.success || !variationsResponse.data) {
    throw new Error(
      "Não deu para carregar os tamanhos do prato original. Nada foi criado.",
    );
  }
  if (!addOnsResponse.success || !addOnsResponse.data) {
    throw new Error(
      "Não deu para carregar os complementos do prato original. Nada foi criado.",
    );
  }
  // O back ignora o filtro por prato e devolve tudo da empresa.
  const variations = variationsResponse.data.filter(
    (variation) => variation.productId === source.id,
  );
  const addOns = addOnsResponse.data.filter(
    (addOn) => addOn.productId === source.id,
  );

  const warnings: string[] = [];

  let images: File[] = [];
  if (source.imageURL?.length) {
    try {
      images = await downloadImages(source.imageURL);
    } catch (error) {
      console.error("Erro ao baixar foto para a cópia:", error);
      warnings.push(
        "Não deu para copiar a foto do prato original, então a cópia foi criada sem foto. Envie uma foto pela edição do prato.",
      );
    }
  }

  const name = buildCopyName(source.name, existingNames);
  const description = source.description ?? "";

  const created = await apiService.createProduct({
    name,
    description,
    costPrice: source.costPrice,
    salePrice: source.salePrice,
    // Nasce indisponível: não aparece para o cliente antes de o lojista
    // revisar nome, foto e descrição.
    isAvailable: false,
    // Estoque não controlado (inclusive vazio) volta como ilimitado, nunca 0.
    stockQuantity: stockForResave(source.stockQuantity),
  });
  const product = created.success ? unwrapProduct(created.data) : null;
  if (!product) {
    throw new Error(created.message || "Erro ao criar a cópia do prato");
  }

  const categoryIds = Array.from(
    new Set(
      (source.productCategories ?? [])
        .map((link) => link.categoryId || link.category?.id)
        .filter((id): id is string => !!id),
    ),
  );
  for (const categoryId of categoryIds) {
    const error = await attempt(() =>
      apiService.linkCategoryToProduct(
        product.id,
        categoryId,
        description || name,
      ),
    );
    if (error) warnings.push(`A categoria não foi vinculada: ${error}`);
  }

  // Um por vez, na ordem do original, para a lista sair na mesma ordem.
  for (const variation of variations) {
    const error = await attempt(() =>
      apiService.productVariations.create(product.id, {
        name: variation.name,
        priceModifier: variation.priceModifier,
        stockQuantity: stockForResave(variation.stockQuantity),
        isAvailable: variation.isAvailable,
      }),
    );
    if (error) warnings.push(`Tamanho "${variation.name}" não copiado: ${error}`);
  }

  for (const addOn of addOns) {
    const error = await attempt(() =>
      apiService.productAddOns.create(product.id, {
        name: addOn.name,
        priceModifier: addOn.priceModifier,
        isAvailable: addOn.isAvailable,
      }),
    );
    if (error) {
      warnings.push(`Complemento "${addOn.name}" não copiado: ${error}`);
    }
  }

  for (const image of images) {
    const upload = await uploadProductImageSafe(product.id, image);
    if (!upload.success) {
      warnings.push(`A foto não foi enviada para a cópia: ${upload.message}`);
    }
  }

  return { product: { ...product, name, isAvailable: false }, warnings };
}
