import type { CreateProductRequest, Product, UpdateProductRequest } from "@/services/api";
import { apiService } from "@/services/api";
import { getCompanyProducts } from "@/services/products";
import { getErrorMessage } from "@/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

function unwrapProduct(raw: unknown): Product | null {
  if (!raw || typeof raw !== "object") return null;

  const obj = raw as Record<string, unknown>;
  if (typeof obj.id === "string") return raw as Product;

  const nested = obj.data;
  if (
    nested &&
    typeof nested === "object" &&
    typeof (nested as { id?: unknown }).id === "string"
  ) {
    return nested as Product;
  }

  return null;
}

function asProductList(old: unknown): Product[] {
  return Array.isArray(old) ? (old as Product[]) : [];
}

function patchCompanyProductLists(
  queryClient: ReturnType<typeof useQueryClient>,
  updater: (old: Product[]) => Product[],
) {
  queryClient.setQueriesData(
    { queryKey: ["products", "company"] },
    (old: unknown) => updater(asProductList(old)),
  );
}

export const useProducts = () => {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const response = await apiService.getAllProducts();
      if (!response.success || !response.data) {
        throw new Error("Falha ao carregar produtos");
      }
      return response.data;
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
};

/**
 * Produtos de uma loja.
 *
 * `options.live` (LDMF-445): no cardápio do cliente a disponibilidade precisa
 * refletir ao vivo o que o restaurante muda (ocultar prato, voltar prato),
 * então usa `staleTime` curto e refaz a busca ao focar a aba / montar. No
 * admin (default) segue sem refetch automático, pra não recarregar a lista a
 * cada foco enquanto o dono edita. A chave da query é a mesma: cliente e admin
 * compartilham o cache; cada um decide seu próprio refetch (opção por observer).
 */
export const useCompanyProducts = (
  companyId: string | null,
  options?: { live?: boolean },
) => {
  const live = options?.live ?? false;
  return useQuery({
    queryKey: ["products", "company", companyId],
    queryFn: () => getCompanyProducts(companyId!),
    enabled: !!companyId,
    staleTime: live ? 30 * 1000 : 10 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnMount: live,
    refetchOnWindowFocus: live,
  });
};

export const useProduct = (productId: string | null) => {
  return useQuery({
    queryKey: ["product", productId],
    queryFn: async () => {
      if (!productId) throw new Error("Product ID is required");
      const response = await apiService.getProduct(productId);
      if (!response.success || !response.data) {
        throw new Error("Falha ao carregar produto");
      }
      return response.data;
    },
    enabled: !!productId,
    staleTime: 15 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
};

export const useCreateProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (productData: CreateProductRequest) => {
      const response = await apiService.createProduct(productData);
      if (!response.success) {
        throw new Error(response.message || "Falha ao criar produto");
      }
      return unwrapProduct(response.data) ?? response.data;
    },
    onSuccess: async (data) => {
      await queryClient.cancelQueries({ queryKey: ["products", "company"] });

      const product = unwrapProduct(data);
      if (product) {
        patchCompanyProductLists(queryClient, (old) =>
          old.some((item) => item.id === product.id) ? old : [...old, product],
        );
      }

      toast.success("Produto criado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao criar produto");
    },
  });
};

export const useUpdateProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateProductRequest;
    }) => {
      const response = await apiService.updateProduct(id, data);
      if (!response.success) {
        throw new Error(response.message || "Falha ao atualizar produto");
      }
      return unwrapProduct(response.data) ?? response.data;
    },
    onSuccess: async (data, variables) => {
      await queryClient.cancelQueries({ queryKey: ["products", "company"] });

      const product = unwrapProduct(data);
      patchCompanyProductLists(queryClient, (old) =>
        old.map((item) =>
          item.id === variables.id
            ? {
                ...item,
                ...(product ?? variables.data),
                id: variables.id,
                imageURL: product?.imageURL?.length
                  ? product.imageURL
                  : item.imageURL,
                productCategories: product?.productCategories?.length
                  ? product.productCategories
                  : item.productCategories,
              }
            : item,
        ),
      );

      if (product) {
        queryClient.setQueryData(["product", variables.id], product);
      }

      toast.success("Produto atualizado com sucesso!");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao atualizar produto");
    },
  });
};

export const useDeleteProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (productId: string) => {
      const response = await apiService.deleteProduct(productId);
      if (!response.success && response.status !== 404) {
        throw new Error(response.message || "Falha ao deletar produto");
      }
      return response.data;
    },
    onSuccess: async (_data, productId) => {
      await queryClient.cancelQueries({ queryKey: ["products", "company"] });
      patchCompanyProductLists(queryClient, (old) =>
        old.filter((item) => item.id !== productId),
      );
      queryClient.removeQueries({ queryKey: ["product", productId] });
      toast.success("Produto removido com sucesso!");
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Erro ao deletar produto"));
    },
  });
};
