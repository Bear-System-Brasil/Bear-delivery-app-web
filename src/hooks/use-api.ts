import { apiService, type UpdateUserRequest } from "@/services/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Hook para gerenciar chamadas de API com cache e estados otimizados
 */
export function useApiQuery<T>(
  key: string[],
  fetcher: () => Promise<T>,
  options?: {
    enabled?: boolean;
    staleTime?: number;
    cacheTime?: number;
  },
) {
  return useQuery({
    queryKey: key,
    queryFn: fetcher,
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? 5 * 60 * 1000, // 5 minutos
    gcTime: options?.cacheTime ?? 10 * 60 * 1000, // 10 minutos
  });
}

/**
 * Hook para mutações de API (POST, PUT, DELETE)
 */
export function useApiMutation<TData, TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: {
    onSuccess?: (data: TData, variables: TVariables) => void;
    onError?: (error: Error, variables: TVariables) => void;
    invalidateQueries?: string[][];
  },
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (data, variables) => {
      // Invalidar queries relacionadas
      if (options?.invalidateQueries) {
        options.invalidateQueries.forEach((queryKey) => {
          queryClient.invalidateQueries({ queryKey });
        });
      }
      options?.onSuccess?.(data, variables);
    },
    onError: options?.onError,
  });
}

/**
 * Hook específico para perfil do usuário
 */
export function useProfile() {
  const updateProfile = useApiMutation(
    // A tela de "editar perfil" só coleta dados pessoais (nunca role/status),
    // por isso o payload real é mais estreito que `UpdateUserRequest` - o
    // backend aceita o PUT parcial mesmo assim.
    // `apiRequest` devolve `{ success: false }` em vez de lançar: sem virar
    // exceção aqui, uma recusa do backend passava como salva e a tela
    // gravava no store os dados que o servidor tinha rejeitado.
    async (data: Partial<UpdateUserRequest>) => {
      const response = await apiService.updateUser(data);
      if (!response.success) {
        // Leva o `code` do back junto, para a tela mostrar recusa de data de
        // nascimento no próprio campo (LDMF-303).
        throw Object.assign(
          new Error(response.message || "Erro ao atualizar perfil"),
          { code: response.code },
        );
      }
      return response;
    },
    {
      invalidateQueries: [["profile"]],
    },
  );

  return {
    updateProfile,
  };
}
