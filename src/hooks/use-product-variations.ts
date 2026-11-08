import { apiService, type SaveProductVariationRequest } from "@/services/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * Hook para buscar as variações (tamanhos) de um produto, usado na tela de
 * gestão. O backend ignora o filtro `productId` da query e devolve todas as
 * variações da empresa - o filtro é feito aqui.
 *
 * `companyId` precisa ser repassado (mesmo fallback `user?.companyId ||
 * user?.id` de use-menu-management.ts/use-categories.ts) - ver comentário
 * equivalente em use-product-add-ons.ts: sem isso o JWT de uma conta owner
 * sem a claim `companyId` faz o backend responder 500 em vez de filtrar.
 */
export const useProductVariations = (
  productId: string | null,
  companyId?: string | null,
) => {
  return useQuery({
    queryKey: ["product-variations", productId, companyId],
    queryFn: async () => {
      const response = await apiService.productVariations.getAll(
        companyId ?? undefined,
      );
      if (!response.success || !response.data) {
        throw new Error(response.message || "Falha ao carregar variações");
      }
      return response.data.filter(
        (variation) => variation.productId === productId,
      );
    },
    enabled: !!productId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
};

/**
 * Variante pro modal de personalização do prato (visível a visitante
 * não-logado navegando o cardápio) - não dispara o popup global de login
 * quando o backend exige token e o visitante ainda não tem um.
 *
 * `companyId` é obrigatório pro backend quando quem chama é role client
 * (o JWT de client não carrega companyId, diferente do staff) - é
 * exatamente o caso de uso real deste hook, já que client tem leitura
 * liberada aqui (diferente de productAddOns).
 */
export const usePublicProductVariations = (
  productId: string | null,
  companyId?: string | null,
) => {
  return useQuery({
    queryKey: ["product-variations", "public", productId, companyId],
    queryFn: async () => {
      const response = await apiService.productVariations.getAllPublic(
        companyId ?? undefined,
      );
      if (!response.success || !response.data) return [];
      return response.data.filter(
        (variation) => variation.productId === productId,
      );
    },
    enabled: !!productId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });
};

/**
 * Todas as variações da empresa numa tacada só, pro cardápio público
 * montar o "A partir de" de cada card sem disparar uma request por prato:
 * o backend ignora o filtro `productId` e devolve a empresa inteira de
 * qualquer jeito (ver usePublicProductVariations), então buscar por prato
 * seria baixar a mesma lista N vezes. O agrupamento por produto fica na
 * tela que consome.
 *
 * A queryKey é deliberadamente diferente da usada pelo fetchQuery em
 * use-cart-actions: lá o cache guarda o envelope cru (`{ success, data }`)
 * e aqui guarda só o array já desembrulhado - compartilhar a chave faria
 * um lado ler o formato do outro.
 */
export const usePublicCompanyProductVariations = (
  companyId?: string | null,
) => {
  return useQuery({
    queryKey: ["product-variations", "public", "by-company", companyId],
    queryFn: async () => {
      const response = await apiService.productVariations.getAllPublic(
        companyId ?? undefined,
      );
      if (!response.success || !response.data) return [];
      return response.data;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });
};

export const useCreateProductVariation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      productId,
      data,
    }: {
      productId: string;
      data: SaveProductVariationRequest;
    }) => {
      const response = await apiService.productVariations.create(
        productId,
        data,
      );
      if (!response.success) {
        throw new Error(response.message || "Falha ao criar variação");
      }
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["product-variations", variables.productId],
      });
      toast.success("Variação criada com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao criar variação");
    },
  });
};

export const useUpdateProductVariation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      productId: _productId,
      data,
    }: {
      id: string;
      productId: string;
      data: SaveProductVariationRequest;
    }) => {
      const response = await apiService.productVariations.update(id, data);
      if (!response.success) {
        throw new Error(response.message || "Falha ao atualizar variação");
      }
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["product-variations", variables.productId],
      });
      toast.success("Variação atualizada com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao atualizar variação");
    },
  });
};

export const useDeleteProductVariation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
    }: {
      id: string;
      productId: string;
    }) => {
      const response = await apiService.productVariations.delete(id);
      if (!response.success) {
        throw new Error(response.message || "Falha ao remover variação");
      }
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["product-variations", variables.productId],
      });
      toast.success("Variação removida com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao remover variação");
    },
  });
};
