import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { apiService, type Product } from "@/services/api";
import { useAuthStore } from "@/stores";
import { useMenuManagement } from "./use-menu-management";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    apiService: {
      getProductsByCompany: vi.fn(),
      getMyCategories: vi.fn(),
      createProduct: vi.fn(),
      updateProduct: vi.fn(),
      deleteProduct: vi.fn(),
      createCategory: vi.fn(),
      linkCategoryToProduct: vi.fn(),
      unlinkCategoryFromProduct: vi.fn(),
      deleteProductImage: vi.fn(),
      productVariations: {
        create: vi.fn(),
      },
      productAddOns: {
        create: vi.fn(),
      },
    },
  };
});

const api = vi.mocked(apiService);

const category = (id: string, name: string) => ({
  id,
  name,
  companyId: "c1",
  description: "",
  created_at: "",
  updated_at: "",
});

const product = (id: string, extra: Partial<Product> = {}) =>
  ({
    id,
    name: `Prato ${id}`,
    description: "",
    costPrice: 10,
    salePrice: 30,
    isAvailable: true,
    stockQuantity: 5,
    companyId: "c1",
    imageURL: [],
    productCategories: [],
    ...extra,
  }) as Product;

const linkedTo = (productId: string, categoryId: string) => [
  { id: `${productId}-${categoryId}`, productId, categoryId, category: category(categoryId, categoryId) },
];

// Formulário válido de partida; cada teste muda só o que interessa.
const validForm = {
  name: "X-Burger",
  description: "Pão, carne e queijo",
  costPrice: 12,
  salePrice: 32.9,
  categoryId: "cat-lanches",
  available: true,
  stockQuantity: 10,
};

let server: Product[] = [];

const initialAuthState = useAuthStore.getState();
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

async function renderMenu() {
  const hook = renderHook(() => useMenuManagement(), { wrapper });
  await waitFor(() => expect(hook.result.current.isLoading).toBe(false));
  return hook;
}

type Hook = Awaited<ReturnType<typeof renderMenu>>["result"];

function fill(result: Hook, fields: Partial<typeof validForm>) {
  act(() => {
    for (const [key, value] of Object.entries(fields)) {
      result.current.updateFormField(key as keyof typeof validForm, value as never);
    }
  });
}

async function save(result: Hook, images?: File[]) {
  await act(async () => {
    await result.current.handleSaveProduct(images);
  });
}

describe("useMenuManagement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    server = [];
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    useAuthStore.setState(
      {
        ...initialAuthState,
        isAuthenticated: true,
        user: {
          id: "owner-1",
          name: "Dono",
          email: "dono@example.com",
          cpf: "",
          phone: "",
          birthDate: "",
          role: "owner",
          companyId: "c1",
        },
      },
      true,
    );
    api.getProductsByCompany.mockImplementation(async () => ({
      success: true,
      data: { data: server, meta: { page: 1, limit: 100, total: server.length, totalPages: 1 } },
    }));
    api.getMyCategories.mockResolvedValue({
      success: true,
      data: {
        data: [category("cat-lanches", "Lanches"), category("cat-bebidas", "Bebidas")],
        meta: { page: 1, limit: 100, total: 2, totalPages: 1 },
      },
    } as never);
    api.linkCategoryToProduct.mockResolvedValue({ success: true } as never);
    api.unlinkCategoryFromProduct.mockResolvedValue({ success: true } as never);
    api.deleteProductImage.mockResolvedValue({ success: true } as never);
  });

  afterEach(() => {
    queryClient.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  describe("lista", () => {
    it("carrega os pratos da empresa do usuário, com o limite máximo", async () => {
      server = [product("p1")];

      const { result } = await renderMenu();

      expect(api.getProductsByCompany).toHaveBeenCalledWith("c1", { page: 1, limit: 100 });
      expect(result.current.products.map((p) => p.id)).toEqual(["p1"]);
      expect(result.current.categories.map((c) => c.id)).toEqual(["cat-lanches", "cat-bebidas"]);
    });

    it("busca por nome ou descrição, sem diferenciar maiúsculas", async () => {
      server = [
        product("p1", { name: "X-Burger" }),
        product("p2", { name: "Suco", description: "Laranja natural" }),
        product("p3", { name: "Refrigerante" }),
      ];
      const { result } = await renderMenu();

      act(() => result.current.setSearchQuery("LARANJA"));
      expect(result.current.products.map((p) => p.id)).toEqual(["p2"]);

      act(() => result.current.setSearchQuery("burg"));
      expect(result.current.products.map((p) => p.id)).toEqual(["p1"]);
    });

    it("filtra pela categoria do vínculo", async () => {
      server = [
        product("p1", { productCategories: linkedTo("p1", "cat-lanches") as never }),
        product("p2", { productCategories: linkedTo("p2", "cat-bebidas") as never }),
      ];
      const { result } = await renderMenu();

      act(() => result.current.setSelectedCategory("cat-bebidas"));

      expect(result.current.products.map((p) => p.id)).toEqual(["p2"]);
      expect(result.current.allProducts).toHaveLength(2);
    });
  });

  describe("validação", () => {
    it.each([
      [{ name: "  " }, "Nome do produto é obrigatório"],
      [{ name: "x".repeat(81) }, "Nome do prato deve ter no máximo 80 caracteres"],
      [{ description: "x".repeat(301) }, "Descrição deve ter no máximo 300 caracteres"],
      [{ salePrice: undefined }, "Preço de venda é obrigatório e deve ser no mínimo R$ 0,01"],
      [{ salePrice: 0 }, "Preço de venda é obrigatório e deve ser no mínimo R$ 0,01"],
      [{ costPrice: undefined }, "Preço de custo é obrigatório e deve ser não-negativo"],
      [{ costPrice: 0.005 }, "Preço de custo, quando informado, deve ser no mínimo R$ 0,01"],
      [{ costPrice: 40 }, "Preço de custo não pode ser maior que o preço de venda"],
      [{ stockQuantity: 0 }, "Quantidade em estoque é obrigatória e deve ser no mínimo 1"],
      [{ categoryId: "" }, "Selecione uma categoria"],
    ])("%o barra com '%s' sem chamar a API", async (override, message) => {
      const { result } = await renderMenu();
      fill(result, { ...validForm, ...override });

      await save(result);

      expect(toast.error).toHaveBeenCalledWith(message);
      expect(api.createProduct).not.toHaveBeenCalled();
    });

    it("custo zero é aceito", async () => {
      api.createProduct.mockResolvedValue({ success: true, data: product("novo") });
      const { result } = await renderMenu();
      fill(result, { ...validForm, costPrice: 0 });

      await save(result);

      expect(api.createProduct).toHaveBeenCalled();
    });

    it.each([
      ["", "O nome da nova categoria é obrigatório"],
      ["Doce", "Nome da categoria deve ter no mínimo 5 caracteres"],
      ["x".repeat(51), "Nome da categoria deve ter no máximo 50 caracteres"],
    ])("categoria nova '%s' é barrada", async (name, message) => {
      const { result } = await renderMenu();
      fill(result, { ...validForm, categoryId: "" });
      act(() => {
        result.current.setIsCreatingCategory(true);
        result.current.setNewCategoryName(name);
      });

      await save(result);

      expect(toast.error).toHaveBeenCalledWith(message);
      expect(api.createCategory).not.toHaveBeenCalled();
    });
  });

  describe("criar prato", () => {
    it("manda todos os campos, vincula a categoria e mostra o prato na lista", async () => {
      api.createProduct.mockResolvedValue({ success: true, data: product("novo", { name: "X-Burger" }) });
      const { result } = await renderMenu();
      act(() => result.current.handleOpenCreateModal());
      fill(result, validForm);

      await save(result);

      expect(api.createProduct).toHaveBeenCalledWith({
        name: "X-Burger",
        description: "Pão, carne e queijo",
        costPrice: 12,
        salePrice: 32.9,
        isAvailable: true,
        stockQuantity: 10,
      });
      expect(api.linkCategoryToProduct).toHaveBeenCalledWith(
        "novo",
        "cat-lanches",
        "Pão, carne e queijo",
      );
      const created = result.current.allProducts.find((p) => p.id === "novo")!;
      expect(created.productCategories![0].category!.name).toBe("Lanches");
      expect(result.current.isModalOpen).toBe(false);
    });

    it("sem descrição, o vínculo usa o nome", async () => {
      api.createProduct.mockResolvedValue({ success: true, data: product("novo") });
      const { result } = await renderMenu();
      fill(result, { ...validForm, description: "" });

      await save(result);

      expect(api.linkCategoryToProduct).toHaveBeenCalledWith("novo", "cat-lanches", "X-Burger");
    });

    it("prato indisponível sai com isAvailable false", async () => {
      api.createProduct.mockResolvedValue({ success: true, data: product("novo") });
      const { result } = await renderMenu();
      fill(result, { ...validForm, available: false });

      await save(result);

      expect(api.createProduct.mock.calls[0][0].isAvailable).toBe(false);
    });

    it("com categoria nova, cria a categoria e vincula o prato a ela", async () => {
      api.createCategory.mockResolvedValue({ success: true, data: category("cat-nova", "Sobremesas") } as never);
      api.createProduct.mockResolvedValue({ success: true, data: product("novo") });
      const { result } = await renderMenu();
      fill(result, { ...validForm, categoryId: "" });
      act(() => {
        result.current.setIsCreatingCategory(true);
        result.current.setNewCategoryName("Sobremesas");
      });

      await save(result);

      expect(api.createCategory).toHaveBeenCalledWith({ name: "Sobremesas", description: "Sobremesas" });
      expect(api.linkCategoryToProduct).toHaveBeenCalledWith("novo", "cat-nova", expect.any(String));
    });

    it("se a categoria nova falhar, não cria o prato", async () => {
      api.createCategory.mockResolvedValue({ success: false } as never);
      const { result } = await renderMenu();
      fill(result, { ...validForm, categoryId: "" });
      act(() => {
        result.current.setIsCreatingCategory(true);
        result.current.setNewCategoryName("Sobremesas");
      });

      await save(result);

      expect(toast.error).toHaveBeenCalledWith("Erro ao criar a nova categoria. Tente novamente.");
      expect(api.createProduct).not.toHaveBeenCalled();
      expect(result.current.isSaving).toBe(false);
    });

    it("criação recusada mostra o erro e mantém o modal aberto", async () => {
      api.createProduct.mockResolvedValue({ success: false, message: "Nome já existe" });
      const { result } = await renderMenu();
      act(() => result.current.handleOpenCreateModal());
      fill(result, validForm);

      await save(result);

      expect(toast.error).toHaveBeenCalledWith("Nome já existe");
      expect(result.current.isModalOpen).toBe(true);
      expect(api.linkCategoryToProduct).not.toHaveBeenCalled();
    });

    it("resposta sem id avisa em vez de seguir sem produto", async () => {
      api.createProduct.mockResolvedValue({ success: true, data: {} as Product });
      const { result } = await renderMenu();
      fill(result, validForm);

      await save(result);

      expect(toast.error).toHaveBeenCalledWith("Produto criado, mas a resposta não veio com ID.");
      expect(api.linkCategoryToProduct).not.toHaveBeenCalled();
    });

    it("falha no vínculo avisa, mas o prato fica criado", async () => {
      api.createProduct.mockResolvedValue({ success: true, data: product("novo") });
      api.linkCategoryToProduct.mockRejectedValue(new Error("offline"));
      const { result } = await renderMenu();
      fill(result, validForm);

      await save(result);

      expect(toast.error).toHaveBeenCalledWith("Prato criado, mas a categoria não foi vinculada.");
      expect(result.current.allProducts.some((p) => p.id === "novo")).toBe(true);
      expect(result.current.isModalOpen).toBe(false);
    });
  });

  describe("editar prato", () => {
    const existing = () =>
      product("p1", {
        name: "X-Salada",
        description: "Com alface",
        costPrice: 8,
        salePrice: 25,
        isAvailable: false,
        stockQuantity: 3,
        imageURL: [{ id: "img1", url: "https://r2.test/a.jpg" }] as never,
        productCategories: linkedTo("p1", "cat-lanches") as never,
      });

    it("abre o formulário com os dados do prato", async () => {
      server = [existing()];
      const { result } = await renderMenu();

      act(() => result.current.handleOpenEditModal(result.current.allProducts[0]));

      expect(result.current.formData).toEqual({
        name: "X-Salada",
        description: "Com alface",
        costPrice: 8,
        salePrice: 25,
        categoryId: "cat-lanches",
        imageURL: ["https://r2.test/a.jpg"],
        available: false,
        stockQuantity: 3,
      });
    });

    it("salva por PUT com todos os campos e não mexe na categoria igual", async () => {
      server = [existing()];
      api.updateProduct.mockResolvedValue({ success: true, data: existing() });
      const { result } = await renderMenu();
      act(() => result.current.handleOpenEditModal(result.current.allProducts[0]));
      fill(result, { salePrice: 27.5 });

      await save(result);

      expect(api.updateProduct).toHaveBeenCalledWith("p1", {
        name: "X-Salada",
        description: "Com alface",
        costPrice: 8,
        salePrice: 27.5,
        isAvailable: false,
        stockQuantity: 3,
      });
      expect(api.unlinkCategoryFromProduct).not.toHaveBeenCalled();
      expect(api.linkCategoryToProduct).not.toHaveBeenCalled();
      expect(result.current.isModalOpen).toBe(false);
    });

    it("trocar a categoria desvincula a antiga e vincula a nova", async () => {
      server = [existing()];
      api.updateProduct.mockResolvedValue({ success: true, data: existing() });
      const { result } = await renderMenu();
      act(() => result.current.handleOpenEditModal(result.current.allProducts[0]));
      fill(result, { categoryId: "cat-bebidas" });

      await save(result);

      expect(api.unlinkCategoryFromProduct).toHaveBeenCalledWith("p1", "cat-lanches");
      expect(api.linkCategoryToProduct).toHaveBeenCalledWith("p1", "cat-bebidas", "Com alface");
    });

    it("atualização recusada mostra o erro e mantém o modal aberto", async () => {
      server = [existing()];
      api.updateProduct.mockResolvedValue({ success: false, message: "Estoque inválido" });
      const { result } = await renderMenu();
      act(() => result.current.handleOpenEditModal(result.current.allProducts[0]));

      await save(result);

      expect(toast.error).toHaveBeenCalledWith("Estoque inválido");
      expect(result.current.isModalOpen).toBe(true);
    });

    it("remover uma foto tira ela do formulário e da lista", async () => {
      server = [existing()];
      const { result } = await renderMenu();
      act(() => result.current.handleOpenEditModal(result.current.allProducts[0]));

      await act(async () => {
        await result.current.handleDeleteProductImage("p1", "img1");
      });

      expect(api.deleteProductImage).toHaveBeenCalledWith("p1", "img1");
      expect(result.current.editingProduct!.imageURL).toEqual([]);
      expect(result.current.allProducts[0].imageURL).toEqual([]);
      expect(toast.success).toHaveBeenCalledWith("Imagem removida");
    });

    it("remoção de foto recusada mantém a foto", async () => {
      server = [existing()];
      api.deleteProductImage.mockResolvedValue({ success: false, message: "Não pode" } as never);
      const { result } = await renderMenu();
      act(() => result.current.handleOpenEditModal(result.current.allProducts[0]));

      await act(async () => {
        await result.current.handleDeleteProductImage("p1", "img1");
      });

      expect(toast.error).toHaveBeenCalledWith("Não pode");
      expect(result.current.editingProduct!.imageURL).toHaveLength(1);
    });
  });

  describe("fotos no salvamento", () => {
    const file = (name: string) => new File(["x"], name, { type: "image/jpeg" });
    const response = (status: number, body: unknown) =>
      ({ ok: status < 300, status, text: async () => JSON.stringify(body) }) as Response;

    beforeEach(() => {
      vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: vi.fn(() => "blob:preview") }));
      api.createProduct.mockResolvedValue({ success: true, data: product("novo") });
    });

    it("envia cada foto para o proxy autenticado e usa o produto devolvido", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        response(200, product("novo", { imageURL: [{ id: "i9", url: "https://r2.test/x.jpg" }] as never })),
      );
      vi.stubGlobal("fetch", fetchMock);
      const { result } = await renderMenu();
      fill(result, validForm);

      await save(result, [file("burger.jpg")]);

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/proxy/product/image/novo");
      expect(init.headers).toEqual({ "X-Auth-Required": "1" });
      expect((init.body as FormData).get("image")).toBeInstanceOf(File);
      const saved = result.current.allProducts.find((p) => p.id === "novo")!;
      expect(saved.imageURL![0].url).toBe("https://r2.test/x.jpg");
    });

    it("se o campo 'image' for recusado, tenta 'file' e depois 'photo'", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(response(400, { message: "campo errado" }))
        .mockResolvedValueOnce(response(400, { message: "campo errado" }))
        .mockResolvedValueOnce(response(200, { url: "https://r2.test/y.jpg", id: "i1" }));
      vi.stubGlobal("fetch", fetchMock);
      const { result } = await renderMenu();
      fill(result, validForm);

      await save(result, [file("burger.jpg")]);

      const fields = fetchMock.mock.calls.map(([, init]) => [...(init.body as FormData).keys()][0]);
      expect(fields).toEqual(["image", "file", "photo"]);
      const saved = result.current.allProducts.find((p) => p.id === "novo")!;
      expect(saved.imageURL![0]).toMatchObject({ id: "i1", url: "https://r2.test/y.jpg" });
    });

    it("404 logo depois de criar espera e tenta de novo", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(response(404, { message: "Produto não encontrado" }))
        .mockResolvedValueOnce(response(200, { url: "https://r2.test/z.jpg" }));
      vi.stubGlobal("fetch", fetchMock);
      const { result } = await renderMenu();
      fill(result, validForm);

      await save(result, [file("burger.jpg")]);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect([...(fetchMock.mock.calls[1][1].body as FormData).keys()][0]).toBe("image");
    });

    it("foto que não sobe avisa com o nome do arquivo e a razão", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(413, { message: "Arquivo muito grande" })));
      const { result } = await renderMenu();
      fill(result, validForm);

      await save(result, [file("gigante.jpg")]);

      expect(toast.error).toHaveBeenCalledWith('Erro ao enviar "gigante.jpg": Arquivo muito grande');
      expect(result.current.isModalOpen).toBe(false);
    });

    it("envia múltiplas fotos seguidas e preserva todas no produto", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(response(200, { url: "https://r2.test/img1.jpg", id: "i1" }))
        .mockResolvedValueOnce(response(200, { url: "https://r2.test/img2.jpg", id: "i2" }));
      vi.stubGlobal("fetch", fetchMock);
      const { result } = await renderMenu();
      fill(result, validForm);

      await save(result, [file("foto1.jpg"), file("foto2.jpg")]);

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const saved = result.current.allProducts.find((p) => p.id === "novo")!;
      expect(saved.imageURL).toHaveLength(2);
      expect(saved.imageURL![0]).toMatchObject({ id: "i1", url: "https://r2.test/img1.jpg" });
      expect(saved.imageURL![1]).toMatchObject({ id: "i2", url: "https://r2.test/img2.jpg" });
    });
  });

  describe("excluir prato", () => {
    const target = () =>
      product("p1", {
        imageURL: [
          { id: "img1", url: "https://r2.test/a.jpg" },
          { id: "local-p1-0", url: "blob:preview" },
        ] as never,
        productCategories: linkedTo("p1", "cat-lanches") as never,
      });

    it("desvincula categoria, apaga fotos do servidor e exclui o prato", async () => {
      server = [target(), product("p2")];
      api.deleteProduct.mockResolvedValue({ success: true } as never);
      const { result } = await renderMenu();

      act(() => result.current.handleRequestDelete(result.current.allProducts[0]));
      expect(result.current.deleteTarget?.id).toBe("p1");

      await act(async () => {
        await result.current.handleConfirmDelete();
      });

      expect(api.unlinkCategoryFromProduct).toHaveBeenCalledWith("p1", "cat-lanches");
      // Prévia local nunca foi para o servidor: não há o que apagar lá.
      expect(api.deleteProductImage).toHaveBeenCalledTimes(1);
      expect(api.deleteProductImage).toHaveBeenCalledWith("p1", "img1");
      expect(api.deleteProduct).toHaveBeenCalledWith("p1");
      expect(result.current.allProducts.map((p) => p.id)).toEqual(["p2"]);
      expect(result.current.deleteTarget).toBeNull();
    });

    it("exclusão recusada traz o prato de volta do servidor e avisa uma vez", async () => {
      server = [target(), product("p2")];
      api.deleteProduct.mockResolvedValue({
        success: false,
        status: 409,
        message: "Prato em pedido aberto",
      } as never);
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { result } = await renderMenu();
      const reads = api.getProductsByCompany.mock.calls.length;

      act(() => result.current.handleRequestDelete(result.current.allProducts[0]));
      await act(async () => {
        await result.current.handleConfirmDelete();
      });

      await waitFor(() =>
        expect(result.current.allProducts.map((p) => p.id)).toEqual(["p1", "p2"]),
      );
      expect(api.getProductsByCompany.mock.calls.length).toBeGreaterThan(reads);
      expect(vi.mocked(toast.error).mock.calls).toEqual([["Prato em pedido aberto"]]);
      expect(result.current.isDeleting).toBe(false);
    });

    it("cancelar a exclusão não chama nada", async () => {
      server = [target()];
      const { result } = await renderMenu();

      act(() => result.current.handleRequestDelete(result.current.allProducts[0]));
      act(() => result.current.handleCancelDelete());
      await act(async () => {
        await result.current.handleConfirmDelete();
      });

      expect(api.deleteProduct).not.toHaveBeenCalled();
    });
  });

  describe("disponibilidade", () => {
    it("vira na hora e manda o produto inteiro com o novo estado", async () => {
      server = [product("p1", { isAvailable: true })];
      api.updateProduct.mockResolvedValue({ success: true, data: product("p1", { isAvailable: false }) });
      const { result } = await renderMenu();

      await act(async () => {
        await result.current.handleToggleAvailability(result.current.allProducts[0]);
      });

      expect(api.updateProduct).toHaveBeenCalledWith("p1", {
        name: "Prato p1",
        description: "",
        costPrice: 10,
        salePrice: 30,
        isAvailable: false,
        stockQuantity: 5,
      });
      await waitFor(() => expect(result.current.allProducts[0].isAvailable).toBe(false));
    });

    it("se o backend recusar, volta ao estado anterior", async () => {
      server = [product("p1", { isAvailable: true })];
      let refuse!: () => void;
      api.updateProduct.mockReturnValue(
        new Promise((resolve) => {
          refuse = () => resolve({ success: false, message: "offline" });
        }),
      );
      const { result } = await renderMenu();

      let pending!: Promise<void>;
      act(() => {
        pending = result.current.handleToggleAvailability(result.current.allProducts[0]);
      });
      await waitFor(() => expect(result.current.allProducts[0].isAvailable).toBe(false));

      await act(async () => {
        refuse();
        await pending;
      });

      await waitFor(() => expect(result.current.allProducts[0].isAvailable).toBe(true));
      expect(toast.error).toHaveBeenCalledWith("Erro ao atualizar disponibilidade");
    });
  });

  describe("unificação de cadastro com abas (LDMF-332)", () => {
    it("abre o modal de criação na aba desejada e limpa os rascunhos", async () => {
      const { result } = await renderMenu();

      act(() => {
        result.current.handleOpenCreateModal("variations");
      });

      expect(result.current.isModalOpen).toBe(true);
      expect(result.current.activeTab).toBe("variations");
      expect(result.current.draftVariations).toEqual([]);
      expect(result.current.draftAddOns).toEqual([]);
    });

    it("abre o modal de edição na aba desejada (atalho de tamanhos ou complementos)", async () => {
      server = [product("p1")];
      const { result } = await renderMenu();

      act(() => {
        result.current.handleOpenEditModal(result.current.allProducts[0], "addons");
      });

      expect(result.current.isModalOpen).toBe(true);
      expect(result.current.activeTab).toBe("addons");
      expect(result.current.editingProduct?.id).toBe("p1");
    });

    it("redireciona para a aba 'details' quando a validação falha ao salvar", async () => {
      const { result } = await renderMenu();

      act(() => {
        result.current.handleOpenCreateModal("variations");
        // Preenche apenas descrição, deixando nome vazio
        result.current.updateFormField("description", "Apenas descrição");
      });

      expect(result.current.activeTab).toBe("variations");

      await act(async () => {
        await result.current.handleSaveProduct();
      });

      expect(toast.error).toHaveBeenCalledWith("Nome do produto é obrigatório");
      expect(result.current.activeTab).toBe("details");
    });

    it("salva prato novo e encadeia variações e complementos de rascunho", async () => {
      api.createProduct.mockResolvedValue({ success: true, data: product("new-p1") });
      api.linkCategoryToProduct.mockResolvedValue({ success: true, data: {} });
      api.productVariations.create.mockResolvedValue({ success: true, data: {} });
      api.productAddOns.create.mockResolvedValue({ success: true, data: {} });

      const { result } = await renderMenu();

      act(() => {
        result.current.handleOpenCreateModal();
      });
      fill(result, validForm);

      act(() => {
        result.current.setDraftVariations([
          {
            id: "draft-var-1",
            name: "Pequeno",
            priceModifier: 0,
            stockQuantity: 10,
            isAvailable: true,
            productId: "",
            created_at: "",
            updated_at: "",
          },
          {
            id: "draft-var-2",
            name: "Grande",
            priceModifier: 10,
            stockQuantity: 5,
            isAvailable: true,
            productId: "",
            created_at: "",
            updated_at: "",
          },
        ]);
        result.current.setDraftAddOns([
          {
            id: "draft-addon-1",
            name: "Bacon Extra",
            priceModifier: 4.5,
            isAvailable: true,
            productId: "",
            created_at: "",
            updated_at: "",
          },
        ]);
      });

      await act(async () => {
        await result.current.handleSaveProduct();
      });

      expect(api.createProduct).toHaveBeenCalledWith(
        expect.objectContaining({ name: "X-Burger" }),
      );
      expect(api.productVariations.create).toHaveBeenCalledTimes(2);
      expect(api.productVariations.create).toHaveBeenNthCalledWith(
        1,
        "new-p1",
        expect.objectContaining({ name: "Pequeno", priceModifier: 0 }),
      );
      expect(api.productVariations.create).toHaveBeenNthCalledWith(
        2,
        "new-p1",
        expect.objectContaining({ name: "Grande", priceModifier: 10 }),
      );

      expect(api.productAddOns.create).toHaveBeenCalledTimes(1);
      expect(api.productAddOns.create).toHaveBeenCalledWith(
        "new-p1",
        expect.objectContaining({ name: "Bacon Extra", priceModifier: 4.5 }),
      );

      expect(result.current.isModalOpen).toBe(false);
    });

    it("avisa sobre falha parcial em variação ou complemento sem perder o prato criado", async () => {
      api.createProduct.mockResolvedValue({ success: true, data: product("new-p2") });
      api.linkCategoryToProduct.mockResolvedValue({ success: true, data: {} });
      api.productVariations.create.mockResolvedValueOnce({
        success: false,
        message: "Erro no tamanho",
      });
      api.productAddOns.create.mockRejectedValueOnce(new Error("Rede instável"));

      const { result } = await renderMenu();

      act(() => {
        result.current.handleOpenCreateModal();
      });
      fill(result, validForm);

      act(() => {
        result.current.setDraftVariations([
          {
            id: "draft-var-1",
            name: "Grande",
            priceModifier: 5,
            stockQuantity: 2,
            isAvailable: true,
            productId: "",
            created_at: "",
            updated_at: "",
          },
        ]);
        result.current.setDraftAddOns([
          {
            id: "draft-addon-1",
            name: "Queijo",
            priceModifier: 3,
            isAvailable: true,
            productId: "",
            created_at: "",
            updated_at: "",
          },
        ]);
      });

      await act(async () => {
        await result.current.handleSaveProduct();
      });

      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Prato criado, mas houve erro ao salvar tamanho(s): "Grande": Erro no tamanho'),
      );
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Prato criado, mas houve erro ao salvar complemento(s): "Queijo": Rede instável'),
      );
      // Prato continua criado no cache e modal fecha normalmente
      expect(result.current.isModalOpen).toBe(false);
    });
  });
});
