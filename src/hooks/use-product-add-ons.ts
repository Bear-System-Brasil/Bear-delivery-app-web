import { apiService, type SaveProductAddOnRequest } from "@/services/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

/**
 * Hook para buscar os complementos de um produto, usado na tela de gestão.
 * O backend ignora o filtro `productId` da query e devolve todos os
 * complementos da empresa - o filtro é feito aqui.
 *
 * `companyId` precisa ser repassado (com o mesmo fallback `user?.companyId
 * || user?.id` usado em use-menu-management.ts/use-categories.ts): o JWT de
 * uma conta owner nem sempre carrega a claim `companyId`, e sem o query
 * param o backend não consegue resolver a empresa e responde 500 em vez de
 * filtrar - foi só sorte esse caso nunca ter sido coberto aqui porque staff
 * comum sempre tem companyId no token.
 */
export const useProductAddOns = (
  productId: string | null,
  companyId?: string | null,
) => {
  return useQuery({
    queryKey: ["product-add-ons", productId, companyId],
    queryFn: async () => {
      const response = await apiService.productAddOns.getAll(
        companyId ?? undefined,
      );
      if (!response.success || !response.data) {
        throw new Error(response.message || "Falha ao carregar complementos");
      }
      return response.data.filter((addOn) => addOn.productId === productId);
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
 * (o JWT de client não carrega companyId, diferente do staff).
 */
export const usePublicProductAddOns = (
  productId: string | null,
  companyId?: string | null,
) => {
  return useQuery({
    queryKey: ["product-add-ons", "public", productId, companyId],
    queryFn: async () => {
      const response = await apiService.productAddOns.getAllPublic(
        companyId ?? undefined,
      );
      if (!response.success || !response.data) return [];
      return response.data.filter((addOn) => addOn.productId === productId);
    },
    enabled: !!productId,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });
};

export const useCreateProductAddOn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      productId,
      data,
    }: {
      productId: string;
      data: SaveProductAddOnRequest;
    }) => {
      const response = await apiService.productAddOns.create(
        productId,
        data,
      );
      if (!response.success) {
        throw new Error(response.message || "Falha ao criar complemento");
      }
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["product-add-ons", variables.productId],
      });
      toast.success("Complemento criado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao criar complemento");
    },
  });
};

export const useUpdateProductAddOn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      productId: _productId,
      data,
    }: {
      id: string;
      productId: string;
      data: SaveProductAddOnRequest;
    }) => {
      const response = await apiService.productAddOns.update(id, data);
      if (!response.success) {
        throw new Error(response.message || "Falha ao atualizar complemento");
      }
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["product-add-ons", variables.productId],
      });
      toast.success("Complemento atualizado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao atualizar complemento");
    },
  });
};

export const useDeleteProductAddOn = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
    }: {
      id: string;
      productId: string;
    }) => {
      const response = await apiService.productAddOns.delete(id);
      if (!response.success) {
        throw new Error(response.message || "Falha ao remover complemento");
      }
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["product-add-ons", variables.productId],
      });
      toast.success("Complemento removido com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao remover complemento");
    },
  });
};
