import {
  copyDayHours,
  EMPTY_WEEK_HOURS,
  findOpeningHoursError,
  getPersistedDays,
  toDayHours,
  toOpeningHoursDays,
  type DayHours,
  type DayKey,
} from "@/constants/opening-hours";
import { apiService } from "@/services/api";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const OPENING_HOURS_KEY = ["opening-hours"] as const;

/**
 * O status Aberto/Fechado precisa acompanhar o backend com a aba aberta: a
 * configuração global do cache (src/providers) não busca de novo no foco nem
 * no mount, e a vitrine ficava mostrando "Aberta" depois do fechamento
 * (LDMF-374). Por isso só esta consulta ganha um ciclo próprio:
 *
 * - de 1 em 1 minuto enquanto a aba estiver visível. Com
 *   `refetchIntervalInBackground: false` o TanStack pula a busca com a aba
 *   oculta;
 * - sempre que o cliente volta para a aba ou a internet volta.
 */
const STATUS_REFETCH_INTERVAL = 60 * 1000;

/** Chave do status público da loja - a mesma que carrinho e checkout leem. */
export const restaurantOpeningHoursKey = (companyId?: string | null) =>
  [...OPENING_HOURS_KEY, "public", companyId] as const;

async function fetchRestaurantOpeningHours(companyId: string) {
  const response = await apiService.openingHours.getByCompany(companyId);
  if (!response.success) {
    throw new Error(response.message || "Erro ao carregar o status");
  }
  return response.data;
}

/**
 * Hook público para obter os horários de funcionamento e status de uma loja.
 * Usado pelas telas de cliente: vitrine do restaurante, modal do prato, carrinho e checkout.
 */
export function useRestaurantOpeningHours(companyId?: string | null) {
  return useQuery({
    queryKey: restaurantOpeningHoursKey(companyId),
    queryFn: () => fetchRestaurantOpeningHours(companyId as string),
    enabled: Boolean(companyId),
    staleTime: STATUS_REFETCH_INTERVAL,
    refetchInterval: STATUS_REFETCH_INTERVAL,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
  });
}

/**
 * Busca o status na hora, ignorando o cache, e atualiza o cache com o
 * resultado - para quem precisa decidir com o dado do backend, como o
 * finalizar do checkout. Em falha, rejeita: quem chama decide o fallback.
 */
export function fetchFreshRestaurantOpeningHours(
  queryClient: QueryClient,
  companyId: string,
) {
  return queryClient.fetchQuery({
    queryKey: restaurantOpeningHoursKey(companyId),
    queryFn: () => fetchRestaurantOpeningHours(companyId),
    staleTime: 0,
    retry: false,
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

  /** "Trazer horário": copia o horário de `source` para `targets`. */
  const copyHours = (source: DayKey, targets: DayKey[]) => {
    setDraft(copyDayHours(hours, source, targets));
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
    copyHours,
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
