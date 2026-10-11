import { useSound } from "@/hooks/use-sound";
import {
  isActiveForDriver,
  isAvailable,
  isFromCourierCompany,
  isCanceled,
  isFinished,
  isRecentlyFinished,
  sortActive,
  sortNewestFinishedFirst,
  sortOldestFirst,
  type DeliveryStatus,
} from "@/lib/delivery";
import { socketAuthProvider } from "@/lib/socket-auth";
import {
  requestPaymentMethodChange,
  type PaymentChangeRequest,
} from "@/services/manager-requests";
import { useCourierPositionStore } from "@/stores/courier-position-store";
import {
  apiService,
  MAX_PAGE_LIMIT,
  toPaginated,
  type Delivery,
  type UpdatePaymentRequest,
  type PaginationParams,
} from "@/services/api";
import { useAuthStore } from "@/stores";
import type { Coords } from "@/types/restaurant";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Socket, io } from "socket.io-client";
import { toast } from "sonner";

const POLL_INTERVAL = 15_000; // mesmo ritmo do painel da cozinha (use-order-management)

/**
 * Uma página só, no maior tamanho que o backend aceita.
 *
 * Este payload alimenta os três grupos da tela E o histórico, e não existe
 * UI de paginação: com o default de 20 o entregador perderia entrega de
 * vista em silêncio, que é exatamente o problema que esta tela veio
 * resolver. Quando o total passar de uma página, a tela avisa em vez de
 * truncar calada - ver `hasMorePages`.
 */
const DELIVERY_PAGE: PaginationParams = { page: 1, limit: MAX_PAGE_LIMIT };

const DELIVERY_TRACKING_URL = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/delivery-tracking`
  : "";

/**
 * A query em si. Compartilhada entre o painel e o histórico: mesma chave =
 * mesmo cache, então navegar entre as duas telas não custa request.
 *
 * `GET /delivery/delivery-person/me` devolve tanto as entregas PENDING
 * (disponíveis pra aceitar) quanto as já atribuídas a este entregador, em
 * qualquer status.
 */
function useMyDeliveriesQuery() {
  const { isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: ["my-deliveries", DELIVERY_PAGE],
    queryFn: async () => {
      const response = await apiService.deliveries.getMyDeliveries(
        DELIVERY_PAGE,
      );
      if (!response.success) {
        throw new Error(response.message || "Erro ao carregar entregas");
      }

      // A rota responde no envelope `{ data, meta }`. `toPaginated` aceita
      // envelope e array cru e devolve sempre `{ items, meta }` - ler
      // `response.data` direto como array é o que estourava
      // "deliveries.find is not a function" no render.
      return toPaginated<Delivery>(response.data, DELIVERY_PAGE);
    },
    refetchInterval: POLL_INTERVAL,
    enabled: !!isAuthenticated,
    staleTime: 10_000,
  });
}

/**
 * Painel do entregador: agrupa a resposta em "minhas", "entregues na última
 * hora" e "disponíveis", e expõe as ações de cada card.
 *
 * O entregador sai com vários pedidos por vez, então `myDeliveries` é uma
 * lista, não uma corrida só, e as disponíveis continuam visíveis mesmo com
 * corrida em andamento.
 */
export const useDeliveryDriver = () => {
  const queryClient = useQueryClient();
  const { play, muted, toggleMuted } = useSound("courier");
  const soundEnabled = !muted;

  const prevPendingIdsRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);
  const socketRef = useRef<Socket | null>(null);

  const { data, isLoading, isError, refetch } = useMyDeliveriesQuery();
  const courierCompanyId = useAuthStore((state) => state.user?.companyId);

  const deliveries = useMemo(() => data?.items ?? [], [data]);

  // A janela de "última hora" precisa correr mesmo quando nada muda no
  // servidor: o react-query devolve a mesma referência quando a resposta é
  // idêntica, então sem este tique a entrega fechada ficaria no grupo muito
  // além da hora numa parada longa.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const groups = useMemo(() => {
    return {
      /** Aceitas e ainda não fechadas - PICKED_UP antes de ACCEPTED. */
      myDeliveries: sortActive(deliveries.filter(isActiveForDriver)),
      /** Fechadas na última hora. Mais antigas só no histórico. */
      recentlyDelivered: sortNewestFinishedFirst(
        deliveries.filter((delivery) => isRecentlyFinished(delivery, now)),
      ),
      /**
       * Sempre visíveis, mesmo com corrida em andamento - mas só as do
       * restaurante do entregador. As que ele já aceitou ficam acima, de
       * qualquer restaurante: precisam ser terminadas.
       */
      availableDeliveries: sortOldestFirst(
        deliveries.filter(
          (delivery) =>
            isAvailable(delivery) &&
            isFromCourierCompany(delivery, courierCompanyId),
        ),
      ),
    };
  }, [deliveries, now, courierCompanyId]);

  const { myDeliveries, recentlyDelivered, availableDeliveries } = groups;

  // "Em rota" e "A coletar" saem de `myDeliveries` em vez de filtrar de novo
  // a resposta: as duas listas herdam a ordem e o critério de "ativa" dela.
  const inRouteDeliveries = useMemo(
    () => myDeliveries.filter((delivery) => delivery.status === "PICKED_UP"),
    [myDeliveries],
  );
  const toPickUpDeliveries = useMemo(
    () => myDeliveries.filter((delivery) => delivery.status === "ACCEPTED"),
    [myDeliveries],
  );

  // ─── Alerta sonoro pra entrega nova disponível ────────────────────────────
  // Toque único, sempre que aparece uma PENDING nova - inclusive com corrida
  // em andamento, já que o entregador leva vários pedidos na mesma saída.
  const availableIdsKey = availableDeliveries.map((d) => d.id).join(",");
  const hasLoadedOnce = data !== undefined;

  useEffect(() => {
    // Enquanto nenhuma resposta chegou, não há baseline pra comparar - sair
    // aqui evita gastar o flag de primeira carga na render vazia e tocar o
    // alerta pra entregas que já estavam na fila quando a tela abriu.
    if (!hasLoadedOnce) return;

    const currentIds = new Set(
      availableIdsKey ? availableIdsKey.split(",") : [],
    );

    // A primeira carga não é "entrega nova": é a tela abrindo.
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      prevPendingIdsRef.current = currentIds;
      return;
    }

    const hasNew = [...currentIds].some(
      (id) => !prevPendingIdsRef.current.has(id),
    );

    if (hasNew && soundEnabled) {
      play("new-job");
    }

    prevPendingIdsRef.current = currentIds;
  }, [hasLoadedOnce, availableIdsKey, soundEnabled, play]);

  // ─── Rastreamento ao vivo enquanto PICKED_UP ──────────────────────────────
  // O backend só considera o tracking "ativo" nesse status (ver
  // tracking-gateway.md) - fora dele nem vale abrir o socket. Com várias
  // corridas ao mesmo tempo, transmite a primeira da fila (a que está na rua
  // há mais tempo); o gateway hoje é por entrega, um socket de cada vez.
  const trackedDelivery =
    myDeliveries.find((delivery) => delivery.status === "PICKED_UP") ?? null;

  useEffect(() => {
    const deliveryId = trackedDelivery?.id;
    if (!deliveryId || !DELIVERY_TRACKING_URL) return;

    // `auth` como função busca token fresco a cada (re)conexão - ver
    // socket-auth.ts. Sem isso, o rastreamento ao vivo parava de atualizar
    // pra sempre depois de uma reconexão com token expirado, sem nenhum
    // aviso.
    const socket = io(DELIVERY_TRACKING_URL, { auth: socketAuthProvider });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("joinDelivery", { deliveryId });
    });

    let watchId: number | null = null;
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };

          socketRef.current?.emit("updateLocation", { deliveryId, ...coords });

          // Reaproveita a medição pro aceite: o navegador já está medindo por
          // causa do rastreamento, então aceitar outra corrida no meio da rua
          // não precisa acordar o GPS de novo. Só observa - não muda nada do
          // que o rastreamento faz.
          useCourierPositionStore
            .getState()
            .setPosition(coords, "tracking");
        },
        () => {
          // Sem permissão de localização - não quebra o resto do fluxo,
          // o cliente só fica sem ver a posição ao vivo.
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      );
    }

    return () => {
      socket.disconnect();
      socketRef.current = null;
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, [trackedDelivery?.id]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["my-deliveries"] });

  // O aceite leva a posição do entregador: o backend recusa sem ela, porque
  // e dali que o frete e calculado.
  const acceptMutation = useMutation({
    mutationFn: ({ id, coords }: { id: string; coords: Coords }) =>
      apiService.deliveries.updateStatus(id, "ACCEPTED", coords),
    onSuccess: (response, { coords }) => {
      invalidate();
      if (response.success) {
        play("success");
        toast.success("Entrega aceita!");
      } else {
        // Posição digitada que o backend recusou não pode ficar em cache: o
        // próximo aceite a reusaria sem perguntar e daria o mesmo erro em
        // laço, por até POSITION_MAX_AGE_MS (LDMF-314). Só a manual e só se
        // for a mesma que foi enviada - GPS e rastreamento se renovam
        // sozinhos, e uma posição corrigida no meio do caminho fica.
        const { position, clearPosition } = useCourierPositionStore.getState();
        if (
          position?.source === "manual" &&
          position.coords.lat === coords.lat &&
          position.coords.lng === coords.lng
        ) {
          clearPosition();
        }
        toast.error(
          response.message ||
            "Não foi possível aceitar - talvez outro entregador já tenha pegado essa.",
        );
      }
    },
    onError: () => toast.error("Erro de conexão ao aceitar entrega"),
  });

  const advanceMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: DeliveryStatus }) =>
      apiService.deliveries.updateStatus(id, next),
    onSuccess: (response, { next }) => {
      invalidate();
      if (response.success) {
        play("success");
        if (next === "DELIVERED") toast.success("Entrega concluída!");
      } else {
        toast.error(
          response.message ||
            (next === "DELIVERED"
              ? "Erro ao marcar como entregue"
              : "Erro ao marcar como coletado"),
        );
      }
    },
    onError: () => toast.error("Erro de conexão"),
  });

  // Devolver, não cancelar: a entrega volta pra lista de disponíveis e outro
  // entregador pode pegar. Cancelar encerraria a entrega do cliente.
  const returnMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      apiService.deliveries.returnToPool(id, reason),
    onSuccess: (response) => {
      invalidate();
      if (response.success) {
        toast.success("Entrega devolvida - outro entregador pode aceitar");
      } else {
        toast.error(response.message || "Erro ao devolver entrega");
      }
    },
    onError: () => toast.error("Erro de conexão"),
  });

  // Forma de pagamento trocada na porta. A gerência altera direto; o
  // entregador só avisa a gerência (LDMF-284 - desligado até o backend ter a
  // rota, ver services/manager-requests.ts).
  const changePaymentMutation = useMutation({
    mutationFn: ({
      paymentId,
      update,
    }: {
      deliveryId: string;
      paymentId: string;
      /** Corpo inteiro do PATCH - ver lib/payment-update.ts. */
      update: UpdatePaymentRequest;
    }) => apiService.payments.update(paymentId, update),
    onSuccess: (response) => {
      invalidate();
      if (response.success) {
        toast.success("Forma de pagamento alterada");
      } else {
        toast.error(response.message || "Erro ao alterar a forma de pagamento");
      }
    },
    onError: () => toast.error("Erro de conexão"),
  });

  const requestPaymentChangeMutation = useMutation({
    mutationFn: (request: PaymentChangeRequest) =>
      requestPaymentMethodChange(request),
    onSuccess: (response) => {
      if (response.success) {
        toast.success("Aviso enviado ao gerente");
      } else {
        toast.error(response.message || "Erro ao avisar o gerente");
      }
    },
    onError: () => toast.error("Erro de conexão"),
  });

  // Com vários cards na tela, travar todos os botões enquanto um request roda
  // esconderia qual entrega está sendo mexida - o estado é por entrega.
  const acceptingId = acceptMutation.isPending
    ? (acceptMutation.variables?.id ?? null)
    : null;
  const advancingId = advanceMutation.isPending
    ? (advanceMutation.variables?.id ?? null)
    : null;
  const returningId = returnMutation.isPending
    ? (returnMutation.variables?.id ?? null)
    : null;
  const changingPaymentId = changePaymentMutation.isPending
    ? (changePaymentMutation.variables?.deliveryId ?? null)
    : requestPaymentChangeMutation.isPending
      ? (requestPaymentChangeMutation.variables?.deliveryId ?? null)
      : null;

  return {
    isLoading,
    isError,
    refetch,
    ...groups,
    /** Já coletadas: o que está na rua e o entregador olha primeiro. */
    inRouteDeliveries,
    /** Aceitas e ainda não buscadas no restaurante. */
    toPickUpDeliveries,
    soundEnabled,
    toggleSound: toggleMuted,
    acceptDelivery: acceptMutation.mutate,
    acceptingId,
    advanceDelivery: advanceMutation.mutate,
    advancingId,
    returnDelivery: returnMutation.mutate,
    returningId,
    isReturning: returnMutation.isPending,
    /** Resolve com a resposta; quem chama decide se fecha a janela. */
    changePaymentMethod: changePaymentMutation.mutateAsync,
    requestPaymentChange: requestPaymentChangeMutation.mutateAsync,
    changingPaymentId,
    isChangingPayment:
      changePaymentMutation.isPending || requestPaymentChangeMutation.isPending,
    /** Envelope da rota - `total` e `totalPages` da página pedida. */
    meta: data?.meta,
    /** Há entrega além desta página: a tela avisa em vez de truncar calada. */
    hasMorePages: (data?.meta.totalPages ?? 1) > 1,
    counts: {
      mine: myDeliveries.length,
      inRoute: inRouteDeliveries.length,
      toPickUp: toPickUpDeliveries.length,
      recent: recentlyDelivered.length,
      available: availableDeliveries.length,
    },
  };
};

/**
 * Histórico do entregador: concluídas e canceladas, da mais recente pra mais
 * antiga.
 *
 * Lê a mesma query do painel, mas de propósito NÃO monta o socket de
 * rastreamento nem o alerta sonoro - o histórico é tela de leitura, e abrir
 * de novo o socket a cada navegação mexeria num rastreio que já funciona.
 */
export const useDeliveryHistory = () => {
  const { data, isLoading, isError, refetch } = useMyDeliveriesQuery();

  const historyDeliveries = useMemo(
    () =>
      sortNewestFinishedFirst(
        (data?.items ?? []).filter(
          (delivery) => isFinished(delivery) || isCanceled(delivery),
        ),
      ),
    [data],
  );

  return {
    isLoading,
    isError,
    refetch,
    historyDeliveries,
    hasMorePages: (data?.meta.totalPages ?? 1) > 1,
  };
};
