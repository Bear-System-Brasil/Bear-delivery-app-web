import { useSound } from "@/hooks/use-sound";
import { apiService, type Address, type Delivery, type Order } from "@/services/api";
import {
  getOrderTrackingStatus,
  isCanceledOrder,
  type OrderTrackingStatus,
} from "@/lib/order-status";
import type { SoundName } from "@/lib/sound";
import { useAuthStore } from "@/stores/auth-store";
import { isClientRole } from "@/utils/role-helpers";
import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * `/delivery/customer/me` e `/order/:id` nem sempre batem 100% com os tipos
 * `Delivery`/`Order` (variam por endpoint/versão do backend) - por isso os
 * campos usados de forma defensiva aqui ficam como extensão opcional em vez
 * de confiar cegamente no tipo base.
 */
type RawDelivery = Partial<Omit<Delivery, "deliveryAddress">> & {
  deliveryAddressId?: string;
  deliveryAddress?: Address | string;
  estimatedDeliveryTime?: string;
};

type RawOrder = Order & {
  orderNumber?: string | number;
  total?: number;
};

export type OrderStatus = OrderTrackingStatus;

const POLL_INTERVAL_MS = 30_000;

const STATUS_SOUNDS: Partial<Record<OrderStatus, SoundName>> = {
  preparing: "step-preparing",
  ready: "step-ready",
  delivering: "step-on-the-way",
  delivered: "order-arrived",
};

export interface OrderInfo {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  estimatedTime: string;
  total: number;
  items: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
  customerInfo: {
    name: string;
    address: string;
    phone: string;
  };
  delivery?: RawDelivery | null;
  rawStatus: string;
  isCanceled: boolean;
}

/**
 * Itens do pedido. Para cliente, vêm do próprio pedido: GET
 * /order-item/order/:id devolve os itens do carrinho aberto, e não os do
 * pedido, quando há carrinho (medido em 16/10; correção no back: LDMF-356).
 * GET /order/customer/me/:id responde 403 para quem não é cliente (dono
 * que comprou cai aqui pelo checkout) - esses seguem na rota antiga.
 */
function fetchOrderItems(orderId: string, userId: string, role?: string) {
  if (!isClientRole(role)) {
    return apiService.orderItems.listByOrder(orderId, userId);
  }
  return apiService.orders
    .getCustomerOrder(orderId)
    .then((response) => ({ ...response, data: response.data?.orderedItems }));
}

async function fetchOrderData(
  orderId: string,
  userId: string,
  userName?: string,
  userPhone?: string,
  role?: string,
): Promise<OrderInfo> {
  // As três chamadas são independentes entre si (nenhuma usa o resultado da
  // outra) - rodar em paralelo em vez de em sequência corta o tempo de
  // espera de cada poll (a cada 30s enquanto o pedido está ativo) de "soma
  // das três" pra "a mais lenta das três".
  const [orderData, orderItemsData, deliveriesResponse] = await Promise.all([
    apiService.orders.viewOrder(userId, orderId),
    fetchOrderItems(orderId, userId, role),
    apiService.deliveries.getCustomerDeliveries().catch(() => null),
  ]);

  if (!orderData.success || !orderData.data) {
    throw new Error(orderData.message || "Não foi possível carregar o pedido");
  }

  let delivery: RawDelivery | null = null;
  if (deliveriesResponse) {
    const deliveries = deliveriesResponse.data || [];
    delivery = deliveries.find((d) => d.orderId === orderId) ?? null;
  }

  const items = orderItemsData.data || [];
  const order = orderData.data as RawOrder;

  let fullAddress = "Endereço não disponível";

  if (delivery?.deliveryAddressId) {
    try {
      const address = delivery.deliveryAddress;
      if (address && typeof address === "object") {
        fullAddress = `${address.street}, ${address.number}${
          address.complement ? ", " + address.complement : ""
        } - ${address.neighborhood}, ${address.city}/${address.state} - CEP: ${address.zipCode}`;
      } else {
        const addressResponse = await apiService.address.getUserAddresses();
        const userAddress = addressResponse.data?.find(
          (addr) => addr.id === delivery?.deliveryAddressId,
        );
        if (userAddress) {
          fullAddress = `${userAddress.street}, ${userAddress.number}${
            userAddress.complement ? ", " + userAddress.complement : ""
          } - ${userAddress.neighborhood}, ${userAddress.city}/${userAddress.state} - CEP: ${userAddress.zipCode}`;
        }
      }
    } catch {
      fullAddress = "Endereço não disponível";
    }
  } else if (typeof delivery?.deliveryAddress === "string") {
    fullAddress = delivery.deliveryAddress;
  }

  const trackedOrder = { status: order.status, delivery };

  return {
    id: order.id,
    orderNumber: String(order.orderNumber ?? ""),
    status: getOrderTrackingStatus(trackedOrder),
    rawStatus: String(order.status ?? ""),
    isCanceled: isCanceledOrder(trackedOrder),
    estimatedTime:
      delivery?.estimatedDeliveryTime || delivery?.estimatedTime || "30-40 min",
    total: order.totalValue || order.total || 0,
    items: items.map((item) => ({
      name: item.product?.name || "Item",
      quantity: item.quantity || 1,
      price: item.unitPrice || item.product?.salePrice || 0,
    })),
    customerInfo: {
      name: userName || "Cliente",
      address: fullAddress,
      phone: userPhone || "Telefone não disponível",
    },
    delivery,
  };
}

/**
 * Hook para rastrear status de pedido
 * Agora com TanStack Query (cache + polling inteligente)
 */
export const useOrderStatus = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const orderId = searchParams?.get("orderId");
  const { user } = useAuthStore();
  const { play } = useSound("customer");

  const announcedStatusRef = useRef<OrderStatus | null>(null);
  const canceledAnnouncedRef = useRef(false);

  const [secondsUntilRefresh, setSecondsUntilRefresh] = useState(
    POLL_INTERVAL_MS / 1000,
  );

  const {
    data: order,
    isLoading: loading,
    isFetching: isRefreshing,
    error: queryError,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["order-status", orderId, user?.id, user?.role],
    queryFn: () =>
      fetchOrderData(orderId!, user!.id, user?.name, user?.phone, user?.role),
    enabled: Boolean(orderId && user?.id),
    staleTime: 10_000, // 10s — evita refetch imediato ao remontar
    gcTime: 5 * 60_000, // 5 min na memória
    refetchOnWindowFocus: true,
    refetchInterval: (query) => {
      const data = query.state.data;
      // Para o polling quando o pedido já terminou
      if (data?.status === "delivered" || data?.isCanceled) {
        return false;
      }
      return POLL_INTERVAL_MS;
    },
    refetchIntervalInBackground: false, // economiza bateria
  });

  const error = queryError
    ? (queryError as Error).message
    : !orderId
      ? "OrderId não encontrado na URL"
      : !user?.id
        ? "Usuário não autenticado"
        : null;

  // Contagem regressiva visual
  useEffect(() => {
    if (!order || order.status === "delivered" || order.isCanceled) {
      return;
    }

    const tick = setInterval(() => {
      const elapsed = Date.now() - dataUpdatedAt;
      const remaining = Math.max(
        0,
        Math.ceil((POLL_INTERVAL_MS - elapsed) / 1000),
      );
      setSecondsUntilRefresh(remaining || POLL_INTERVAL_MS / 1000);
    }, 1000);

    return () => clearInterval(tick);
  }, [dataUpdatedAt, order?.status, order?.isCanceled]);

  // Sons de avanço de status (mesma lógica de antes)
  useEffect(() => {
    const status = order?.status;
    if (!status) return;

    const isCanceled = Boolean(order?.isCanceled);
    const previous = announcedStatusRef.current;

    if (previous === null) {
      announcedStatusRef.current = status;
      canceledAnnouncedRef.current = isCanceled;
      return;
    }

    if (isCanceled) {
      if (!canceledAnnouncedRef.current) {
        canceledAnnouncedRef.current = true;
        play("error");
      }
      return;
    }

    if (previous === status) return;

    announcedStatusRef.current = status;
    const sound = STATUS_SOUNDS[status];
    if (sound) play(sound);
  }, [order?.status, order?.isCanceled, play]);

  const getStatusMessage = (status: OrderStatus): string => {
    const messages = {
      confirmed: "Pedido confirmado! Estamos preparando com carinho.",
      preparing: "Seu pedido está sendo preparado na cozinha.",
      ready: "Pedido pronto! Saindo para entrega.",
      delivering: "Pedido a caminho! Chegando em breve.",
      delivered: "Pedido entregue! Esperamos que tenha gostado!",
    };
    return messages[status];
  };

  return {
    order: order ?? null,
    loading,
    error,
    isRefreshing, // true só quando está refetchando em background
    secondsUntilRefresh,
    refresh: () => refetch(),
    router,
    getStatusMessage,
  };
};
