import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiService, type Category, type Product } from "@/services/api";
import { useAuthStore } from "@/stores";
import { useCategoryManagement } from "./use-category-management";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Isola o hook do data-fetching real: controlamos categorias e produtos
// direto, e espionamos só o PATCH de produto (o bulk de visibilidade).
const { productsState, categoriesState } = vi.hoisted(() => ({
  productsState: { data: [] as Product[] },
  categoriesState: { data: [] as Category[] },
}));

vi.mock("./use-categories", () => ({
  useCategories: () => ({ data: categoriesState.data, isLoading: false }),
  useCreateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("./use-products", () => ({
  useCompanyProducts: () => ({ data: productsState.data }),
}));

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    apiService: { updateProduct: vi.fn() },
  };
});

const api = vi.mocked(apiService);

const category: Category = {
  id: "cat-1",
  name: "Lanches",
  companyId: "c1",
  description: "",
  created_at: "",
  updated_at: "",
} as Category;

function makeProduct(
  id: string,
  isAvailable: boolean,
  categoryId = "cat-1",
): Product {
  return {
    id,
    name: `Produto ${id}`,
    description: "desc",
    costPrice: 10,
    salePrice: 20,
    isAvailable,
    companyId: "c1",
    stockQuantity: 5,
    productCategories: [
      {
        id: `${id}-link`,
        productId: id,
        categoryId,
        created_at: "",
        updated_at: "",
      },
    ],
    created_at: "",
    updated_at: "",
  };
}

const initialAuthState = useAuthStore.getState();
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function storageKey() {
  return "bear:category-availability:c1";
}

describe("useCategoryManagement - visibilidade da categoria (LDMF-442)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    api.updateProduct.mockResolvedValue({ success: true } as never);
    useAuthStore.setState({
      isAuthenticated: true,
      user: {
        id: "u1",
        name: "Staff",
        email: "staff@example.com",
        cpf: "",
        phone: "",
        birthDate: "",
        role: "owner",
        companyId: "c1",
      },
    });
  });

  afterEach(() => {
    useAuthStore.setState(initialAuthState, true);
  });

  it("deriva status: ativa com item disponível, contagem por categoria", () => {
    productsState.data = [
      makeProduct("p1", true),
      makeProduct("p2", false),
    ];
    categoriesState.data = [category];

    const { result } = renderHook(() => useCategoryManagement(), { wrapper });

    expect(result.current.categoryStatusMap["cat-1"]).toEqual({
      count: 2,
      active: true,
    });
    expect(result.current.hasCategoryProductData).toBe(true);
  });

  it("esconder: marca os disponíveis como indisponíveis e guarda o estado anterior", async () => {
    productsState.data = [
      makeProduct("p1", true),
      makeProduct("p2", true),
      makeProduct("p3", false), // já indisponível não é tocado
    ];
    categoriesState.data = [category];

    const { result } = renderHook(() => useCategoryManagement(), { wrapper });

    await act(async () => {
      await result.current.handleToggleCategoryActive(category);
    });

    expect(api.updateProduct).toHaveBeenCalledTimes(2);
    const patchedIds = api.updateProduct.mock.calls.map(([id]) => id).sort();
    expect(patchedIds).toEqual(["p1", "p2"]);
    expect(api.updateProduct).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ isAvailable: false }),
    );

    const snapshot = JSON.parse(
      window.localStorage.getItem(storageKey()) ?? "{}",
    );
    expect(snapshot["cat-1"].sort()).toEqual(["p1", "p2"]);
  });

  it("religar (opção B): restaura só quem estava disponível antes", async () => {
    productsState.data = [
      makeProduct("p1", false),
      makeProduct("p2", false),
      makeProduct("p3", false),
    ];
    categoriesState.data = [category];
    window.localStorage.setItem(
      storageKey(),
      JSON.stringify({ "cat-1": ["p1"] }),
    );

    const { result } = renderHook(() => useCategoryManagement(), { wrapper });

    await act(async () => {
      await result.current.handleToggleCategoryActive(category);
    });

    expect(api.updateProduct).toHaveBeenCalledTimes(1);
    expect(api.updateProduct).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ isAvailable: true }),
    );
    // Registro consumido ao religar.
    const snapshot = JSON.parse(
      window.localStorage.getItem(storageKey()) ?? "{}",
    );
    expect(snapshot["cat-1"]).toBeUndefined();
  });

  it("religar (fallback A): sem registro, libera todos os itens da categoria", async () => {
    productsState.data = [
      makeProduct("p1", false),
      makeProduct("p2", false),
    ];
    categoriesState.data = [category];

    const { result } = renderHook(() => useCategoryManagement(), { wrapper });

    await act(async () => {
      await result.current.handleToggleCategoryActive(category);
    });

    expect(api.updateProduct).toHaveBeenCalledTimes(2);
    expect(api.updateProduct).toHaveBeenCalledWith(
      "p1",
      expect.objectContaining({ isAvailable: true }),
    );
    expect(api.updateProduct).toHaveBeenCalledWith(
      "p2",
      expect.objectContaining({ isAvailable: true }),
    );
  });

  it("categoria sem itens não dispara PATCH", async () => {
    productsState.data = [makeProduct("p1", true, "cat-OTHER")];
    categoriesState.data = [category];

    const { result } = renderHook(() => useCategoryManagement(), { wrapper });

    expect(result.current.categoryStatusMap["cat-1"]).toBeUndefined();

    await act(async () => {
      await result.current.handleToggleCategoryActive(category);
    });

    expect(api.updateProduct).not.toHaveBeenCalled();
  });
});
