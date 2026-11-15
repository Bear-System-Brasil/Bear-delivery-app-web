import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UNLIMITED_STOCK } from "@/lib/unlimited-stock";
import type { Product } from "@/services/api";
import { buildCopyName, duplicateProduct } from "./duplicate-product";

/**
 * Duplicação de prato (LDMF-489). Travam o que a cópia manda para o back e
 * o que acontece quando parte da cópia falha.
 */

const { api, uploadProductImageSafe } = vi.hoisted(() => ({
  api: {
    createProduct: vi.fn(),
    linkCategoryToProduct: vi.fn(),
    variationsGetAll: vi.fn(),
    variationsCreate: vi.fn(),
    addOnsGetAll: vi.fn(),
    addOnsCreate: vi.fn(),
  },
  uploadProductImageSafe: vi.fn(),
}));

vi.mock("@/services/api", () => ({
  apiService: {
    createProduct: api.createProduct,
    linkCategoryToProduct: api.linkCategoryToProduct,
    productVariations: {
      getAll: api.variationsGetAll,
      create: api.variationsCreate,
    },
    productAddOns: { getAll: api.addOnsGetAll, create: api.addOnsCreate },
  },
}));

vi.mock("./upload-product-image", () => ({ uploadProductImageSafe }));

const IMAGE_URL =
  "https://pub-e75b88e293b14bb3978db5a6fe91a9bd.r2.dev/like-delivery/product/abc.png";

function sourceProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "p1",
    name: "Pizza Calabresa",
    description: "Molho, calabresa e cebola",
    costPrice: 12,
    salePrice: 39.9,
    isAvailable: true,
    companyId: "comp-1",
    stockQuantity: 25,
    imageURL: [
      {
        id: "img-1",
        url: IMAGE_URL,
        productId: "p1",
        created_at: "",
        updated_at: "",
      },
    ],
    productCategories: [
      {
        id: "pc-1",
        productId: "p1",
        categoryId: "cat-1",
        created_at: "",
        updated_at: "",
      },
    ],
    ...overrides,
  } as Product;
}

const ok = <T,>(data: T) => ({ success: true, data });

describe("buildCopyName", () => {
  it("acrescenta (cópia) e numera a partir da segunda", () => {
    expect(buildCopyName("Pizza", ["Pizza"])).toBe("Pizza (cópia)");
    expect(buildCopyName("Pizza", ["Pizza", "Pizza (cópia)"])).toBe(
      "Pizza (cópia 2)",
    );
    expect(
      buildCopyName("Pizza", ["Pizza", "pizza (CÓPIA)", "Pizza (cópia 2)"]),
    ).toBe("Pizza (cópia 3)");
  });

  it("duplicar uma cópia não empilha sufixo", () => {
    expect(buildCopyName("Pizza (cópia)", ["Pizza", "Pizza (cópia)"])).toBe(
      "Pizza (cópia 2)",
    );
    expect(
      buildCopyName("Pizza (cópia 2)", [
        "Pizza",
        "Pizza (cópia)",
        "Pizza (cópia 2)",
      ]),
    ).toBe("Pizza (cópia 3)");
  });

  it("corta o nome base para caber nos 80 caracteres", () => {
    const longName = "A".repeat(80);
    const copy = buildCopyName(longName, [longName]);

    expect(copy).toHaveLength(80);
    expect(copy.endsWith(" (cópia)")).toBe(true);
  });
});

describe("duplicateProduct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "fetch",
      // Response nova a cada chamada: o corpo só pode ser lido uma vez.
      vi.fn().mockImplementation(
        async () =>
          new Response("foto", {
            status: 200,
            headers: { "content-type": "image/png" },
          }),
      ),
    );
    api.createProduct.mockResolvedValue(
      ok({ id: "p2", name: "Pizza Calabresa (cópia)" }),
    );
    api.linkCategoryToProduct.mockResolvedValue(ok(undefined));
    api.variationsGetAll.mockResolvedValue(
      ok([
        {
          id: "v1",
          productId: "p1",
          name: "Grande",
          priceModifier: 10,
          stockQuantity: 5,
          isAvailable: true,
        },
        {
          id: "v2",
          productId: "p1",
          name: "Broto",
          priceModifier: -5,
          stockQuantity: null,
          isAvailable: false,
        },
        // De outro prato: o back devolve tudo da empresa.
        { id: "v3", productId: "outro", name: "Família", priceModifier: 20 },
      ]),
    );
    api.variationsCreate.mockResolvedValue(ok({}));
    api.addOnsGetAll.mockResolvedValue(
      ok([
        {
          id: "a1",
          productId: "p1",
          name: "Borda recheada",
          priceModifier: 8,
          isAvailable: true,
        },
        { id: "a2", productId: "outro", name: "Bacon", priceModifier: 4 },
      ]),
    );
    api.addOnsCreate.mockResolvedValue(ok({}));
    uploadProductImageSafe.mockResolvedValue({ success: true, data: {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("cria a cópia indisponível com os mesmos dados do original", async () => {
    const result = await duplicateProduct({
      source: sourceProduct(),
      companyId: "comp-1",
      existingNames: ["Pizza Calabresa"],
    });

    expect(api.createProduct).toHaveBeenCalledWith({
      name: "Pizza Calabresa (cópia)",
      description: "Molho, calabresa e cebola",
      costPrice: 12,
      salePrice: 39.9,
      isAvailable: false,
      stockQuantity: 25,
    });
    expect(api.linkCategoryToProduct).toHaveBeenCalledWith(
      "p2",
      "cat-1",
      "Molho, calabresa e cebola",
    );
    expect(result.warnings).toEqual([]);
    expect(result.product).toMatchObject({
      id: "p2",
      name: "Pizza Calabresa (cópia)",
      isAvailable: false,
    });
  });

  it("copia só os tamanhos e complementos do prato, na mesma ordem", async () => {
    await duplicateProduct({
      source: sourceProduct(),
      companyId: "comp-1",
      existingNames: [],
    });

    expect(api.variationsGetAll).toHaveBeenCalledWith("comp-1");
    expect(api.variationsCreate.mock.calls).toEqual([
      [
        "p2",
        { name: "Grande", priceModifier: 10, stockQuantity: 5, isAvailable: true },
      ],
      // Estoque vazio é "não controlado": vai como ilimitado, nunca 0.
      [
        "p2",
        {
          name: "Broto",
          priceModifier: -5,
          stockQuantity: UNLIMITED_STOCK,
          isAvailable: false,
        },
      ],
    ]);
    expect(api.addOnsCreate.mock.calls).toEqual([
      [
        "p2",
        { name: "Borda recheada", priceModifier: 8, isAvailable: true },
      ],
    ]);
  });

  it("estoque esgotado (0) continua 0 e estoque vazio vira ilimitado", async () => {
    await duplicateProduct({
      source: sourceProduct({ stockQuantity: 0 }),
      companyId: "comp-1",
      existingNames: [],
    });
    expect(api.createProduct.mock.calls[0][0].stockQuantity).toBe(0);

    await duplicateProduct({
      source: sourceProduct({ stockQuantity: undefined }),
      companyId: "comp-1",
      existingNames: [],
    });
    expect(api.createProduct.mock.calls[1][0].stockQuantity).toBe(
      UNLIMITED_STOCK,
    );
  });

  it("baixa a foto pela rota do servidor e envia para a cópia", async () => {
    await duplicateProduct({
      source: sourceProduct(),
      companyId: "comp-1",
      existingNames: [],
    });

    expect(fetch).toHaveBeenCalledWith(
      `/api/product-image/download?url=${encodeURIComponent(IMAGE_URL)}`,
      { cache: "no-store" },
    );
    expect(uploadProductImageSafe).toHaveBeenCalledTimes(1);
    const [productId, file] = uploadProductImageSafe.mock.calls[0];
    expect(productId).toBe("p2");
    expect(file).toBeInstanceOf(File);
    expect((file as File).name).toBe("abc.png");
    expect((file as File).type).toBe("image/png");
  });

  it("foto que falha ao baixar não trava: cria sem foto e avisa", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("", { status: 502 }));

    const result = await duplicateProduct({
      source: sourceProduct(),
      companyId: "comp-1",
      existingNames: [],
    });

    expect(api.createProduct).toHaveBeenCalled();
    expect(uploadProductImageSafe).not.toHaveBeenCalled();
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("criada sem foto");
  });

  it("uma foto que falha entre várias: a cópia sai sem foto nenhuma", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response("foto", { headers: { "content-type": "image/png" } }),
      )
      .mockResolvedValueOnce(new Response("", { status: 502 }));

    const source = sourceProduct();
    source.imageURL = [
      ...(source.imageURL ?? []),
      { ...source.imageURL![0], id: "img-2", url: `${IMAGE_URL}?v=2` },
    ];

    const result = await duplicateProduct({
      source,
      companyId: "comp-1",
      existingNames: [],
    });

    expect(uploadProductImageSafe).not.toHaveBeenCalled();
    expect(result.warnings[0]).toContain("criada sem foto");
  });

  it("falha ao ler tamanhos ou complementos: não cria nada", async () => {
    api.addOnsGetAll.mockResolvedValue({ success: false, message: "500" });

    await expect(
      duplicateProduct({
        source: sourceProduct(),
        companyId: "comp-1",
        existingNames: [],
      }),
    ).rejects.toThrow("Nada foi criado");
    expect(api.createProduct).not.toHaveBeenCalled();
  });

  it("sem preço de custo não cria (não inventa 0)", async () => {
    await expect(
      duplicateProduct({
        source: sourceProduct({ costPrice: undefined }),
        companyId: "comp-1",
        existingNames: [],
      }),
    ).rejects.toThrow("preço de custo");
    expect(api.createProduct).not.toHaveBeenCalled();
  });

  it("falha ao criar o prato vira erro com a mensagem do back", async () => {
    api.createProduct.mockResolvedValue({
      success: false,
      message: "Nome inválido",
    });

    await expect(
      duplicateProduct({
        source: sourceProduct(),
        companyId: "comp-1",
        existingNames: [],
      }),
    ).rejects.toThrow("Nome inválido");
    expect(api.variationsCreate).not.toHaveBeenCalled();
  });

  it("tamanho ou complemento que falha vira aviso e o resto segue", async () => {
    api.variationsCreate
      .mockResolvedValueOnce({ success: false, message: "Duplicado" })
      .mockResolvedValueOnce(ok({}));
    api.addOnsCreate.mockRejectedValue(new Error("Rede caiu"));

    const result = await duplicateProduct({
      source: sourceProduct(),
      companyId: "comp-1",
      existingNames: [],
    });

    expect(api.variationsCreate).toHaveBeenCalledTimes(2);
    expect(uploadProductImageSafe).toHaveBeenCalled();
    expect(result.warnings).toEqual([
      'Tamanho "Grande" não copiado: Duplicado',
      'Complemento "Borda recheada" não copiado: Rede caiu',
    ]);
  });
});
