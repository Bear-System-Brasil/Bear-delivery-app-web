import {
  ACCEPTED_PAYMENT_METHODS,
  getAcceptedPaymentMethodsErrorMessage,
  resolveAcceptedPaymentMethods,
  type AcceptedPaymentMethod,
} from "@/lib/accepted-payment-methods";
import { apiService } from "@/services/api";
import { getRestaurant } from "@/services/restaurant";
import type { Restaurant } from "@/types/restaurant";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

/**
 * Formas de pagamento aceitas pela empresa, para o dono configurar no perfil
 * (LDMF-251). Lê de GET /company/:id e grava com PATCH /company/:id.
 *
 * Usa a mesma chave de cache do checkout (`["restaurant", id]`), mas sem
 * staleTime: o dono precisa ver o que está gravado agora, não o de 15 min
 * atrás.
 */
export const useCompanyAcceptedPaymentMethods = (
  companyId: string | null | undefined,
) => {
  const queryClient = useQueryClient();
  const queryKey = ["restaurant", companyId ?? null];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => getRestaurant(companyId!),
    enabled: !!companyId,
    staleTime: 0,
  });

  const saved = resolveAcceptedPaymentMethods(data?.acceptedPaymentMethods);
  // null = nada alterado; segue o que está gravado.
  const [draft, setDraft] = useState<AcceptedPaymentMethod[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selected = draft ?? saved;
  const hasChanges = draft !== null && draft.join(",") !== saved.join(",");

  const toggleMethod = (method: AcceptedPaymentMethod) => {
    const next = selected.includes(method)
      ? selected.filter((item) => item !== method)
      : [...selected, method];
    // Mantém a ordem fixa, independente da ordem dos cliques.
    setDraft(ACCEPTED_PAYMENT_METHODS.filter((item) => next.includes(item)));
  };

  const discardChanges = () => setDraft(null);

  const handleSave = async () => {
    if (!companyId || isSaving) return;

    // O backend recusa lista vazia (PAYMENT_METHODS_EMPTY); barra antes.
    if (selected.length === 0) {
      toast.error("Escolha pelo menos uma forma de pagamento.");
      return;
    }

    setIsSaving(true);
    try {
      // A lista substitui a anterior inteira: vai sempre completa.
      const response = await apiService.companies.updateAcceptedPaymentMethods(
        companyId,
        selected,
      );

      if (!response.success) {
        toast.error(getAcceptedPaymentMethodsErrorMessage(response.message));
        return;
      }

      queryClient.setQueryData<Restaurant>(queryKey, (previous) =>
        previous ? { ...previous, acceptedPaymentMethods: selected } : previous,
      );
      setDraft(null);
      toast.success("Formas de pagamento atualizadas!");
      // Confere com o que o backend gravou de fato.
      void queryClient.invalidateQueries({ queryKey });
    } finally {
      setIsSaving(false);
    }
  };

  return {
    selected,
    hasChanges,
    toggleMethod,
    discardChanges,
    handleSave,
    isSaving,
    isLoading,
    isError,
    refetch,
  };
};
