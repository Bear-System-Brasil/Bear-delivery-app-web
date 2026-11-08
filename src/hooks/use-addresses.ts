import { apiService } from "@/services/api";
import { useAuthStore } from "@/stores";
import { useQuery } from "@tanstack/react-query";

/**
 * Hook para buscar endereços do usuário
 *
 * As mutations de criar/atualizar/deletar endereço e a busca por CEP que
 * viviam aqui (useCreateAddress/useUpdateAddress/useDeleteAddress/useViaCep)
 * nunca tiveram nenhum caller de verdade - as telas de perfil usam a lógica
 * própria em use-profile-management.ts/use-company-profile-management.ts.
 * Removidas pra não ter duas implementações de CRUD de endereço divergindo
 * (uma delas sem os ajustes de complemento curto/lat-lng nulo).
 */
export const useUserAddresses = () => {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: ["addresses", "user", user?.id],
    queryFn: async () => {
      const response = await apiService.address.getUserAddresses();
      if (!response.success || !response.data) {
        return [];
      }

      // GET /address/me já é escopado ao usuário autenticado pelo JWT no
      // backend (ver adress.md) - filtrar de novo por customerId aqui zerava
      // a lista sempre. DELETE agora é soft delete (isActive: false, não
      // some do banco) - não dá pra confiar que a listagem já exclui os
      // inativos, então filtra aqui (isActive ausente = trata como ativo,
      // pra não quebrar em respostas antigas sem esse campo).
      const addresses = Array.isArray(response.data) ? response.data : [];
      return addresses.filter((addr) => addr.isActive !== false);
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutos
  });
};
