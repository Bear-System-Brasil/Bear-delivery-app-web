import {
  EMPTY_WEEK_HOURS,
  findOpeningHoursError,
  getPersistedDays,
  toDayHours,
  toOpeningHoursDays,
  type DayHours,
  type DayKey,
} from "@/constants/opening-hours";
import { apiService } from "@/services/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const OPENING_HOURS_KEY = ["opening-hours"] as const;

/**
 * `isOpen` é cacheado no backend, não recalculado a cada request - então
 * nada de `refetchInterval` aqui. Um staleTime folgado evita bater na rota
 * a cada foco de janela para um dado que não muda em tempo real.
 */
const STATUS_STALE_TIME = 5 * 60 * 1000;

/**
 * Hook público para obter os horários de funcionamento e status de uma loja.
 * Usado pelas telas de cliente: vitrine do restaurante, modal do prato, carrinho e checkout.
 */
export function useRestaurantOpeningHours(companyId?: string | null) {
  return useQuery({
    queryKey: [...OPENING_HOURS_KEY, "public", companyId],
    queryFn: async () => {
      const response = await apiService.openingHours.getByCompany(
        companyId as string,
      );
      if (!response.success) {
        throw new Error(response.message || "Erro ao carregar o status");
      }
      return response.data;
    },
    enabled: Boolean(companyId),
    staleTime: STATUS_STALE_TIME,
  });
}

/**
 * Horário de funcionamento da empresa autenticada, como a tela de perfil
 * usa: a grade editável vem de GET /opening-hours/me e o status
 * Aberto/Fechado vem da rota pública, que é quem devolve `isOpen`.
 */
export function useCompanyOpeningHours(companyId?: string | null) {
  const queryClient = useQueryClient();

  const statusQuery = useRestaurantOpeningHours(companyId);

  const hoursQuery = useQuery({
    queryKey: [...OPENING_HOURS_KEY, "me"],
    queryFn: async () => {
      const response = await apiService.openingHours.getMine();
      if (!response.success) {
        throw new Error(response.message || "Erro ao carregar o horário");
      }
      return toDayHours(response.data);
    },
    staleTime: 60_000,
  });

  // `draft` só existe depois que o dono mexe em algo. Enquanto for null, a
  // tela mostra o servidor - assim um refetch não atropela edição em curso,
  // e não precisa de useEffect sincronizando estado com query.
  const [draft, setDraft] = useState<DayHours[] | null>(null);

  // Sem dados do servidor - porque não há nada salvo ou porque o GET falhou
  // - a tela cai na semana em branco, nunca em lista vazia. Loja nova precisa
  // dos sete dias na mão para conseguir cadastrar o primeiro horário.
  //
  // Quando um refetch falha mas já havia dados, `hoursQuery.data` continua
  // preenchido: aí vale mostrar o que temos, com o aviso, em vez de apagar.
  const hours = draft ?? hoursQuery.data ?? EMPTY_WEEK_HOURS;
  const hasChanges = draft !== null;

  const persistedDays = useMemo(
    () => getPersistedDays(hoursQuery.data),
    [hoursQuery.data],
  );

  const updateDay = (day: DayKey, patch: Partial<DayHours>) => {
    setDraft(
      hours.map((item) => (item.day === day ? { ...item, ...patch } : item)),
    );
  };

  const discardChanges = () => setDraft(null);

  const saveMutation = useMutation({
    mutationFn: async (days: DayHours[]) => {
      const response = await apiService.openingHours.updateMine({
        days: toOpeningHoursDays(days),
      });
      if (!response.success) {
        throw new Error(response.message || "Erro ao salvar o horário");
      }
      return response.data;
    },
    onSuccess: () => {
      // Volta a seguir o servidor: o que ele gravou é a verdade, inclusive
      // se o upsert tiver mantido algum dia que a tela não mandou.
      setDraft(null);
      queryClient.invalidateQueries({ queryKey: OPENING_HOURS_KEY });
      toast.success("Horário de funcionamento atualizado");
    },
    onError: (error: Error) =>
      toast.error(error.message || "Erro ao salvar o horário"),
  });

  const handleSaveHours = () => {
    const error = findOpeningHoursError(hours);
    if (error) {
      toast.error(error);
      return;
    }

    saveMutation.mutate(hours);
  };

  return {
    hours,
    hasChanges,
    updateDay,
    discardChanges,
    handleSaveHours,
    isSavingHours: saveMutation.isPending,

    /** Dias que existem no servidor - os únicos que não podem ser desmarcados. */
    persistedDays,

    isLoadingHours: hoursQuery.isLoading,
    isHoursError: hoursQuery.isError,
    hoursError:
      hoursQuery.error instanceof Error ? hoursQuery.error.message : null,
    refetchHours: hoursQuery.refetch,

    /** `null` enquanto a rota pública não respondeu - aí o badge não aparece. */
    isOpenNow: statusQuery.data?.isOpen ?? null,
    linkedToCashRegister: statusQuery.data?.linkedToCashRegister ?? false,
  };
}
