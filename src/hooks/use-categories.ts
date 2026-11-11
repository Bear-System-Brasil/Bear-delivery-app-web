import { apiService, MAX_PAGE_LIMIT, toPaginated, type Category, type CreateCategoryRequest } from "@/services/api";
import { useAuthStore } from "@/stores";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * Helper: invalida todas as queries de categorias
 */
function invalidateCategoryQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  options?: { categoryId?: string },
) {
  // Pega ['categories', 'my', ...] e ['categories', 'all']
  queryClient.invalidateQueries({ queryKey: ["categories"] });

  if (options?.categoryId) {
    queryClient.invalidateQueries({
      queryKey: ["category", options.categoryId],
    });
  }
}

/**
 * Hook para buscar categorias da empresa autenticada (per-restaurant)
 * GET /categories/me já é escopado por empresa no backend - o filtro por
 * companyId aqui é só uma rede de segurança extra.
 * Sem paginação de verdade (ver pagination.md): pede o limite máximo (100)
 * numa página só - nenhum restaurante real chega perto disso em categorias,
 * então cobre o caso todo sem precisar de Prev/Next na tela.
 */
export const useCategories = () => {
  const { user } = useAuthStore();
  const companyIdToMatch = user?.companyId || user?.id;

  return useQuery({
    queryKey: ["categories", "my", companyIdToMatch],
    queryFn: async () => {
      const response = await apiService.getMyCategories({
        page: 1,
        limit: MAX_PAGE_LIMIT,
      });
      if (!response.success || !response.data) {
        throw new Error("Falha ao carregar categorias");
      }

      // toPaginated aceita envelope e array cru (LDMF-495).
      const categories = toPaginated(response.data).items;

      // Filtrar categorias pela empresa autenticada
      if (companyIdToMatch) {
        return categories.filter(
          (category) => category.companyId === companyIdToMatch,
        );
      }

      return categories;
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000, // 10 min
    gcTime: 30 * 60 * 1000, // 30 min
    refetchOnWindowFocus: false, // admin não precisa refetch a cada foco
  });
};

/**
 * Hook para buscar todas as categorias (público, global)
 */
export const useAllCategories = () => {
  return useQuery({
    queryKey: ["categories", "all"],
    queryFn: async () => {
      const response = await apiService.getAllCategories();
      if (!response.success || !response.data) {
        throw new Error("Falha ao carregar categorias");
      }
      return response.data;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
};

/**
 * Hook para buscar uma categoria específica
 */
export const useCategory = (categoryId: string | null) => {
  return useQuery({
    queryKey: ["category", categoryId],
    queryFn: async () => {
      if (!categoryId) throw new Error("Category ID is required");
      const response = await apiService.getCategory(categoryId);
      if (!response.success || !response.data) {
        throw new Error("Falha ao carregar categoria");
      }
      return response.data;
    },
    enabled: !!categoryId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
};

/**
 * Hook para criar uma categoria (company-specific)
 */
export const useCreateCategory = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const companyIdToMatch = user?.companyId || user?.id;

  return useMutation({
    mutationFn: async (categoryData: CreateCategoryRequest) => {
      const response = await apiService.createMyCategory(categoryData);
      if (!response.success) {
        throw new Error(response.message || "Falha ao criar categoria");
      }
      return response.data;
    },
    onSuccess: (data) => {
      invalidateCategoryQueries(queryClient);

      // Insere direto no cache em vez de confiar só na invalidação - um GET
      // disparado logo em seguida do POST às vezes ainda vem sem a categoria
      // recém-criada (mesmo sintoma já visto em produtos: só aparecia depois
      // de F5).
      if (data) {
        queryClient.setQueryData(
          ["categories", "my", companyIdToMatch],
          (old: Category[] = []) =>
            old.some((c) => c.id === data.id) ? old : [...old, data],
        );
      }

      toast.success("Categoria criada com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao criar categoria");
    },
  });
};

/**
 * Hook para atualizar uma categoria (company-specific)
 */
export const useUpdateCategory = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const companyIdToMatch = user?.companyId || user?.id;

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: CreateCategoryRequest;
    }) => {
      const response = await apiService.updateMyCategory(id, data);
      if (!response.success) {
        throw new Error(response.message || "Falha ao atualizar categoria");
      }
      return response.data;
    },
    onSuccess: (data, variables) => {
      invalidateCategoryQueries(queryClient, { categoryId: variables.id });

      queryClient.setQueryData(
        ["categories", "my", companyIdToMatch],
        (old: Category[] = []) =>
          old.map((c) =>
            c.id === variables.id ? { ...c, ...(data || variables.data) } : c,
          ),
      );

      toast.success("Categoria atualizada com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao atualizar categoria");
    },
  });
};

/**
 * Hook para deletar uma categoria (company-specific)
 */
export const useDeleteCategory = () => {
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const companyIdToMatch = user?.companyId || user?.id;

  return useMutation({
    mutationFn: async (categoryId: string) => {
      const response = await apiService.deleteMyCategory(categoryId);
      if (!response.success) {
        throw new Error(response.message || "Falha ao deletar categoria");
      }
      return response.data;
    },
    onSuccess: (_data, categoryId) => {
      invalidateCategoryQueries(queryClient, { categoryId });

      queryClient.setQueryData(
        ["categories", "my", companyIdToMatch],
        (old: Category[] = []) => old.filter((c) => c.id !== categoryId),
      );

      toast.success("Categoria deletada com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao deletar categoria");
    },
  });
};
