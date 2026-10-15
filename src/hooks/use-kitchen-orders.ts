"use client";

/**
 * Toda a busca de dados da tela da cozinha vive aqui.
 *
 * Carrega REST primeiro e mantém o quadro em tempo real via Socket.IO
 * (namespace `/orders` — ver kitchen-orders.md), com polling só como
 * fallback enquanto o socket está desconectado. A tela recebe colunas
 * prontas e algumas ações; não sabe como os dados chegam.
 */

import {
  KITCHEN_COLUMNS,
  KITCHEN_FALLBACK_POLL_INTERVAL,
  KITCHEN_PAGE_LIMIT,
  KITCHEN_POLL_STAGGER,
  KITCHEN_SOCKET_NAMESPACE,
  KITCHEN_STATUSES,
  KITCHEN_WORKFLOW_STATUSES,
  PAGINATED_STATUSES,
  type KitchenColumnState,
  type KitchenOrder,
  type KitchenOrdersPage,
  type KitchenPeriod,
  type KitchenStatus,
} from "@/components/kitchen/types";
import { getPeriodRange, isSameLocalDay } from "@/components/kitchen/helpers";
import { useSound } from "@/hooks/use-sound";
import { acknowledgeOrder } from "@/lib/order-alerts";
import { socketAuthProvider } from "@/lib/socket-auth";
import {
  advanceKitchenOrderStatus,
  cancelKitchenOrder,
  fetchKitchenOrdersByStatus,
  toKitchenErrorMessage,
} from "@/services/kitchen";
import { useAuthStore, usePreferencesStore } from "@/stores";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";

type PagedCache = InfiniteData<KitchenOrdersPage, number>;

interface PeriodRange {
  startDate?: string;
  endDate?: string;
}

const KITCHEN_SOCKET_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}${KITCHEN_SOCKET_NAMESPACE}`
  : "";

/** Quanto tempo o card recém-chegado fica destacado. */
const HIGHLIGHT_MS = 12_000;

/** Redesenha os relógios dos cards sem refazer requisição. */
function useElapsedTicker(interval = 15_000) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), interval);
    return () => clearInterval(id);
  }, [interval]);
}

function flatten(cache?: PagedCache): KitchenOrder[] {
  return cache?.pages.flatMap((page) => page.data) ?? [];
}

/**
 * Única fonte da chave de cache por coluna — usada tanto pela query quanto
 * pelas operações de cache (otimista e eventos de socket), pra elas nunca
 * divergirem. Só Concluídos/Cancelados carregam o período na chave; Novos/Em
 * Preparo/Prontos têm uma chave fixa, porque nunca levam filtro de data.
 */
function kitchenQueryKey(status: KitchenStatus, range: PeriodRange) {
  if (!PAGINATED_STATUSES.includes(status)) {
    return ["kitchen-orders", status] as const;
  }
  return ["kitchen-orders", status, range.startDate ?? "all", range.endDate ?? "all"] as const;
}

/**
 * Uma coluna = uma query paginada em `/order/company/status/:status`.
 * `pollingEnabled` só é `true` quando o socket está fora do ar — enquanto
 * conectado, o cache vive dos eventos `orderCreated`/`orderStatusUpdated`.
 */
function useKitchenColumnQuery(
  status: KitchenStatus,
  staggerIndex: number,
  enabled: boolean,
  range: PeriodRange,
  pollingEnabled: boolean,
) {
  const isDateFiltered = PAGINATED_STATUSES.includes(status);

  return useInfiniteQuery<
    KitchenOrdersPage,
    Error,
    PagedCache,
    readonly unknown[],
    number
  >({
    queryKey: kitchenQueryKey(status, range),
    queryFn: ({ pageParam }) =>
      fetchKitchenOrdersByStatus(status, {
        page: pageParam,
        limit: KITCHEN_PAGE_LIMIT,
        startDate: isDateFiltered ? range.startDate : undefined,
        endDate: isDateFiltered ? range.endDate : undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined,
    enabled,
    refetchInterval: pollingEnabled
      ? KITCHEN_FALLBACK_POLL_INTERVAL + staggerIndex * KITCHEN_POLL_STAGGER
      : false,
    // Aba em background não faz polling: ao voltar o foco a query revalida.
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: KITCHEN_FALLBACK_POLL_INTERVAL / 2,
  });
}

type ColumnQuery = ReturnType<typeof useKitchenColumnQuery>;

/**
 * Colunas sem filtro de data mostram tudo: vão puxando as páginas seguintes
 * sozinhas até acabar.
 *
 * As três flags saem do objeto antes do efeito de propósito. O React Query
 * devolve um objeto novo a cada render, e chamar `query.fetchNextPage()`
 * faria o exhaustive-deps exigir o receptor inteiro na lista - o efeito
 * voltaria a rodar em todo render, inclusive nos do tick de tempo decorrido.
 * Com os três valores soltos, a lista é honesta e a regra consegue vigiar o
 * hook em vez de ignorá-lo, o que ela faz quando não existe lista nenhuma.
 */
function useAutoPaging(query: ColumnQuery) {
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
}

function toColumnState(
  config: (typeof KITCHEN_COLUMNS)[number],
  query: ColumnQuery,
): KitchenColumnState {
  const pages = query.data?.pages ?? [];
  // O contador do cabeçalho vem de `meta.total`, não do que está na tela.
  const meta = pages[pages.length - 1]?.meta;

  return {
    config,
    orders: flatten(query.data),
    total: meta?.total ?? 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    hasMore: !!query.hasNextPage,
    isLoadingMore: query.isFetchingNextPage,
    loadMore: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
    },
    refetch: () => {
      query.refetch();
    },
  };
}

export function useKitchenOrders() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const queryClient = useQueryClient();

  const soundEnabled = usePreferencesStore((state) => state.kitchenSoundEnabled);
  const setKitchenSound = usePreferencesStore((state) => state.setKitchenSound);
  const { play, unlock } = useSound("restaurant");

  const [activeStatus, setActiveStatus] = useState<KitchenStatus>("ORDERED");
  const [highlighted, setHighlighted] = useState<string[]>([]);
  const [showCanceled, setShowCanceled] = useState(false);
  // Período do filtro de data — só afeta Concluídos/Cancelados (ver kitchenQueryKey).
  const [period, setPeriod] = useState<KitchenPeriod>("today");
  const [customDate, setCustomDate] = useState(() => new Date());
  const [isLive, setIsLive] = useState(false);
  const seenIdsRef = useRef<Set<string> | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const range = getPeriodRange(period, customDate);
  // Um evento chegando "agora" só pertence à janela de Concluídos/Cancelados
  // que está sendo exibida quando essa janela inclui o presente — senão um
  // pedido concluído neste instante ia parar, errado, dentro de uma data
  // específica no passado.
  const coversNow = period !== "custom" || isSameLocalDay(customDate, new Date());

  useElapsedTicker();

  const queryKeyFor = useCallback(
    (status: KitchenStatus) => kitchenQueryKey(status, range),
    [range.startDate, range.endDate],
  );

  // ─── Uma query por coluna ─────────────────────────────────────────────────
  // Cinco chamadas explícitas: os quatro status de trabalho + Cancelados, que só
  // é consultado quando `showCanceled` está ligado. Nenhum outro valor do enum
  // de Order é consultado, então nada além destes cinco chega à tela.
  const enabled = !!isAuthenticated;
  const pollingEnabled = !isLive;
  const orderedQuery = useKitchenColumnQuery("ORDERED", 0, enabled, range, pollingEnabled);
  const productionQuery = useKitchenColumnQuery("IN_PRODUCTION", 1, enabled, range, pollingEnabled);
  const readyQuery = useKitchenColumnQuery("READY_FOR_PICKUP", 2, enabled, range, pollingEnabled);
  const completedQuery = useKitchenColumnQuery("COMPLETED", 3, enabled, range, pollingEnabled);
  const canceledQuery = useKitchenColumnQuery(
    "CANCELED",
    4,
    enabled && showCanceled,
    range,
    pollingEnabled,
  );

  const queryByStatus: Record<KitchenStatus, ColumnQuery> = {
    ORDERED: orderedQuery,
    IN_PRODUCTION: productionQuery,
    READY_FOR_PICKUP: readyQuery,
    COMPLETED: completedQuery,
    CANCELED: canceledQuery,
  };

  // Novos, Em preparo e Prontos mostram tudo: puxam as páginas seguintes
  // sozinhos. Concluídos e Cancelados só avançam quando o usuário pede "ver
  // mais". A lista é explícita porque hook não se chama dentro de laço, então
  // coluna nova fora de PAGINATED_STATUSES precisa de uma chamada aqui.
  useAutoPaging(orderedQuery);
  useAutoPaging(productionQuery);
  useAutoPaging(readyQuery);

  const columns = Object.fromEntries(
    KITCHEN_COLUMNS.map((config) => [
      config.status,
      toColumnState(config, queryByStatus[config.status]),
    ]),
  ) as Record<KitchenStatus, KitchenColumnState>;

  // ─── Pedido novo: destaque momentâneo + alerta sonoro opcional ─────────────

  const orderedIdsKey = columns.ORDERED.orders.map((order) => order.id).join(",");

  useEffect(() => {
    const currentIds = orderedIdsKey ? orderedIdsKey.split(",") : [];

    // Primeira carga não é novidade: nada pisca nem apita ao abrir a tela.
    if (seenIdsRef.current === null) {
      if (columns.ORDERED.isLoading) return;
      seenIdsRef.current = new Set(currentIds);
      return;
    }

    const fresh = currentIds.filter((id) => !seenIdsRef.current!.has(id));
    seenIdsRef.current = new Set(currentIds);
    if (fresh.length === 0) return;

    setHighlighted((prev) => [...new Set([...prev, ...fresh])]);
    if (soundEnabled) play("new-order");

    const timeout = setTimeout(() => {
      setHighlighted((prev) => prev.filter((id) => !fresh.includes(id)));
    }, HIGHLIGHT_MS);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedIdsKey, columns.ORDERED.isLoading, soundEnabled, play]);

  const toggleSound = useCallback(() => {
    // Destravar o áudio precisa acontecer dentro do gesto do usuário
    // (política de autoplay); ligar o som é exatamente esse gesto.
    if (!soundEnabled) unlock();
    setKitchenSound(!soundEnabled);
  }, [soundEnabled, setKitchenSound, unlock]);

  const toggleCanceled = useCallback(() => {
    setShowCanceled((visible) => {
      const next = !visible;
      // Saindo de Cancelados: se era a coluna ativa nas abas, volta pra Novos.
      if (!next) setActiveStatus((current) => (current === "CANCELED" ? "ORDERED" : current));
      return next;
    });
  }, []);

  // ─── Cache: mover pedido entre colunas (update otimista e eventos de socket) ─

  const removeFromColumn = useCallback(
    (status: KitchenStatus, orderId: string) => {
      queryClient.setQueryData<PagedCache>(queryKeyFor(status), (cache) => {
        if (!cache) return cache;
        return {
          ...cache,
          pages: cache.pages.map((page) => ({
            data: page.data.filter((order) => order.id !== orderId),
            meta: {
              ...page.meta,
              total: page.data.some((order) => order.id === orderId)
                ? Math.max(0, page.meta.total - 1)
                : page.meta.total,
            },
          })),
        };
      });
    },
    [queryClient, queryKeyFor],
  );

  const insertIntoColumn = useCallback(
    (status: KitchenStatus, order: KitchenOrder) => {
      queryClient.setQueryData<PagedCache>(queryKeyFor(status), (cache) => {
        if (!cache || cache.pages.length === 0) return cache;
        // Otimista + eco do próprio socket podem coincidir: sem isso, duplicaria o card.
        const alreadyThere = cache.pages.some((page) =>
          page.data.some((existing) => existing.id === order.id),
        );
        if (alreadyThere) return cache;
        const [first, ...rest] = cache.pages;
        return {
          ...cache,
          pages: [
            {
              data: [{ ...order, status }, ...first.data],
              meta: { ...first.meta, total: first.meta.total + 1 },
            },
            ...rest.map((page) => ({
              ...page,
              meta: { ...page.meta, total: page.meta.total + 1 },
            })),
          ],
        };
      });
    },
    [queryClient, queryKeyFor],
  );

  const snapshot = useCallback(
    (statuses: KitchenStatus[]) =>
      statuses.map(
        (status) =>
          [status, queryClient.getQueryData<PagedCache>(queryKeyFor(status))] as const,
      ),
    [queryClient, queryKeyFor],
  );

  const restore = useCallback(
    (entries: ReadonlyArray<readonly [KitchenStatus, PagedCache | undefined]>) => {
      entries.forEach(([status, cache]) => {
        queryClient.setQueryData(queryKeyFor(status), cache);
      });
    },
    [queryClient, queryKeyFor],
  );

  /**
   * Aplica o snapshot de um evento de socket: tira de onde estava, põe onde
   * está agora. Colunas com filtro de período (Concluídos/Cancelados) só são
   * tocadas quando o período exibido cobre o presente — ver `coversNow`.
   */
  const applyOrderSnapshot = useCallback(
    (order: KitchenOrder) => {
      KITCHEN_STATUSES.forEach((status) => {
        if (status === order.status) return;
        if (PAGINATED_STATUSES.includes(status) && !coversNow) return;
        removeFromColumn(status, order.id);
      });
      if (PAGINATED_STATUSES.includes(order.status) && !coversNow) return;
      insertIntoColumn(order.status, order);
    },
    [removeFromColumn, insertIntoColumn, coversNow],
  );

  // O socket é aberto uma vez só (ver efeito abaixo) e os handlers dele
  // guardavam o `applyOrderSnapshot` da primeira renderização - com o
  // período e a janela de datas de "Hoje". Trocando para "7 dias" ou
  // "Tudo", pedido concluído em outro aparelho saía de Prontos e não
  // entrava em Concluídos. A ref entrega sempre a versão atual.
  const applyOrderSnapshotRef = useRef(applyOrderSnapshot);
  useEffect(() => {
    applyOrderSnapshotRef.current = applyOrderSnapshot;
  }, [applyOrderSnapshot]);

  // ─── Tempo real: Socket.IO no namespace /orders ────────────────────────────
  // Sempre conectado enquanto autenticado: Novos/Em Preparo/Prontos são
  // sempre ao vivo, não importa qual período esteja selecionado pra
  // Concluídos/Cancelados.

  useEffect(() => {
    if (!isAuthenticated || !KITCHEN_SOCKET_URL) {
      setIsLive(false);
      return;
    }

    // `auth` como função (não `{ token }` estático) é buscado a cada
    // tentativa de conexão, inclusive reconexões automáticas do socket.io -
    // sem isso, um token expirado depois de uma queda de rede ficava sendo
    // reenviado pra sempre, travando em `connect_error` até dar F5.
    const socket = io(KITCHEN_SOCKET_URL, { auth: socketAuthProvider });
    socketRef.current = socket;

    socket.on("connect", () => {
      setIsLive(true);
      // Ao reconectar, refaz a consulta REST do intervalo atual — o
      // socket não substitui a sincronização inicial.
      queryClient.invalidateQueries({ queryKey: ["kitchen-orders"] });

      socket.emit("joinCompanyOrders", undefined, (ack?: { ok?: boolean }) => {
        if (!ack?.ok) {
          toast.error("Não foi possível acompanhar os pedidos em tempo real.");
        }
      });
    });

    socket.on("disconnect", () => setIsLive(false));
    socket.on("connect_error", () => setIsLive(false));

    socket.on("orderCreated", (order: KitchenOrder) =>
      applyOrderSnapshotRef.current(order),
    );
    socket.on("orderStatusUpdated", (order: KitchenOrder) =>
      applyOrderSnapshotRef.current(order),
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsLive(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ─── Avançar status ───────────────────────────────────────────────────────

  const advanceMutation = useMutation({
    mutationFn: ({ order, next }: { order: KitchenOrder; next: KitchenStatus }) =>
      advanceKitchenOrderStatus(order.id, next),

    onMutate: async ({ order, next }) => {
      acknowledgeOrder(order.id);
      const from = order.status;
      await queryClient.cancelQueries({ queryKey: ["kitchen-orders"] });
      const previous = snapshot([from, next]);

      removeFromColumn(from, order.id);
      insertIntoColumn(next, order);
      setHighlighted((prev) => prev.filter((id) => id !== order.id));

      return { previous };
    },

    onError: (error, _variables, context) => {
      if (context?.previous) restore(context.previous);
      toast.error(toKitchenErrorMessage(error));
    },

    onSettled: (_data, _error, { order, next }) => {
      queryClient.invalidateQueries({ queryKey: queryKeyFor(order.status) });
      queryClient.invalidateQueries({ queryKey: queryKeyFor(next) });
    },
  });

  // ─── Cancelar ─────────────────────────────────────────────────────────────

  const cancelMutation = useMutation({
    mutationFn: ({ order, reason }: { order: KitchenOrder; reason: string }) =>
      cancelKitchenOrder(order.id, reason),

    onMutate: async ({ order }) => {
      await queryClient.cancelQueries({ queryKey: ["kitchen-orders"] });
      const previous = snapshot([order.status, "CANCELED"]);
      removeFromColumn(order.status, order.id);
      if (showCanceled && coversNow) {
        insertIntoColumn("CANCELED", { ...order, status: "CANCELED" });
      }
      return { previous };
    },

    onSuccess: () => {
      toast.success("Pedido cancelado");
    },

    onError: (error, _variables, context) => {
      if (context?.previous) restore(context.previous);
      toast.error(toKitchenErrorMessage(error));
    },

    onSettled: (_data, _error, { order }) => {
      queryClient.invalidateQueries({ queryKey: queryKeyFor(order.status) });
      queryClient.invalidateQueries({ queryKey: queryKeyFor("CANCELED") });
    },
  });

  const advanceOrder = useCallback(
    (order: KitchenOrder) => {
      const next = KITCHEN_COLUMNS.find((c) => c.status === order.status)?.nextStatus;
      if (!next) return;
      advanceMutation.mutate({ order, next });
    },
    [advanceMutation],
  );

  const cancelOrder = useCallback(
    (order: KitchenOrder, reason: string) => cancelMutation.mutateAsync({ order, reason }),
    [cancelMutation],
  );

  const refetchAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["kitchen-orders"] });
  }, [queryClient]);

  const visibleStatuses: readonly KitchenStatus[] = showCanceled
    ? KITCHEN_STATUSES
    : KITCHEN_WORKFLOW_STATUSES;

  const isEmptyBoard =
    KITCHEN_WORKFLOW_STATUSES.every((status) => columns[status].orders.length === 0) &&
    !columns.ORDERED.isLoading;

  const activeOrderTotal =
    columns.ORDERED.total + columns.IN_PRODUCTION.total + columns.READY_FOR_PICKUP.total;

  return {
    columns,
    columnOrder: KITCHEN_COLUMNS.filter((c) => visibleStatuses.includes(c.status)),
    activeStatus,
    setActiveStatus,
    highlightedIds: highlighted,
    isEmptyBoard,
    activeOrderTotal,
    isRefreshing: visibleStatuses.some((status) => columns[status].isFetching),
    hasError: visibleStatuses.some((status) => columns[status].isError),
    soundEnabled,
    toggleSound,
    showCanceled,
    toggleCanceled,
    period,
    setPeriod,
    customDate,
    setCustomDate,
    isLive,
    advanceOrder,
    cancelOrder,
    advancingOrderId: advanceMutation.isPending
      ? advanceMutation.variables?.order.id
      : undefined,
    isCanceling: cancelMutation.isPending,
    refetchAll,
  };
}

export type UseKitchenOrders = ReturnType<typeof useKitchenOrders>;
