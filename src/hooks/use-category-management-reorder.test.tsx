import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiService, type Category } from "@/services/api";
import { useAuthStore } from "@/stores";
import { useCategoryManagement } from "./use-category-management";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const { categoriesState } = vi.hoisted(() => ({
  categoriesState: { data: [] as Category[] },
}));

vi.mock("./use-categories", () => ({
  useCategories: () => ({ data: categoriesState.data, isLoading: false }),
  useCreateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteCategory: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("./use-products", () => ({
  useCompanyProducts: () => ({ data: [] }),
}));

vi.mock("@/services/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/api")>();
  return {
    ...actual,
    apiService: { reorderMyCategories: vi.fn() },
  };
});

const api = vi.mocked(apiService);

function makeCategory(id: string, name: string): Category {
  return {
    id,
    name,
    description: "",
    companyId: "c1",
    created_at: "",
    updated_at: "",
  } as Category;
}

const initialAuthState = useAuthStore.getState();
let queryClient: QueryClient;

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function loginAs(role: string) {
  useAuthStore.setState({
    isAuthenticated: true,
    user: {
      id: "u1",
      name: "Staff",
      email: "s@s",
      cpf: "",
      phone: "",
      birthDate: "",
      role,
      companyId: "c1",
    },
  });
}

describe("useCategoryManagement - reordenar categorias (LDMF-345)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    categoriesState.data = [
      makeCategory("a", "Pizzas"),
      makeCategory("b", "Bebidas"),
      makeCategory("c", "Sobremesas"),
    ];
    loginAs("owner");
  });

  afterEach(() => {
    useAuthStore.setState(initialAuthState, true);
  });

  it("canReorder: owner/manager sim, admin não", () => {
    const { result, rerender } = renderHook(() => useCategoryManagement(), {
      wrapper,
    });
    expect(result.current.canReorder).toBe(true);

    loginAs("manager");
    rerender();
    expect(result.current.canReorder).toBe(true);

    loginAs("admin");
    rerender();
    expect(result.current.canReorder).toBe(false);
  });

  it("mover pra baixo troca a ordem e marca como alterado", () => {
    const { result } = renderHook(() => useCategoryManagement(), { wrapper });

    expect(result.current.categories.map((c) => c.id)).toEqual([
      "a",
      "b",
      "c",
    ]);

    act(() => result.current.handleMoveCategoryUp("a")); // já é o primeiro: no-op
    expect(result.current.isReorderDirty).toBe(false);

    act(() => result.current.handleMoveCategoryDown("a"));
    expect(result.current.categories.map((c) => c.id)).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(result.current.isReorderDirty).toBe(true);
  });

  it("salvar envia todos os ids na ordem nova e grava a resposta", async () => {
    api.reorderMyCategories.mockResolvedValue({
      success: true,
      data: [
        makeCategory("b", "Bebidas"),
        makeCategory("a", "Pizzas"),
        makeCategory("c", "Sobremesas"),
      ],
    } as never);

    const { result } = renderHook(() => useCategoryManagement(), { wrapper });

    act(() => result.current.handleMoveCategoryDown("a"));

    await act(async () => {
      await result.current.handleSaveOrder();
    });

    expect(api.reorderMyCategories).toHaveBeenCalledWith(["b", "a", "c"]);
    expect(result.current.isReorderDirty).toBe(false);
    expect(toast.success).toHaveBeenCalled();
  });

  it("busca ativa: trava a reordenação e mostra a lista filtrada", () => {
    const { result } = renderHook(() => useCategoryManagement(), { wrapper });

    act(() => result.current.setSearchQuery("Bebi"));

    expect(result.current.isSearching).toBe(true);
    expect(result.current.categories.map((c) => c.id)).toEqual(["b"]);
  });

  it("404 ao salvar avisa pra recarregar e mantém o rascunho", async () => {
    api.reorderMyCategories.mockResolvedValue({
      success: false,
      status: 404,
    } as never);

    const { result } = renderHook(() => useCategoryManagement(), { wrapper });

    act(() => result.current.handleMoveCategoryDown("a"));
    await act(async () => {
      await result.current.handleSaveOrder();
    });

    expect(toast.error).toHaveBeenCalledWith(
      expect.stringContaining("Recarregue"),
    );
    expect(result.current.isReorderDirty).toBe(true);
  });
});
