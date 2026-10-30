"use client";

/**
 * Motor do sino global: fica de olho em pedidos e chama `notify()` quando
 * algo relevante muda, não importa em qual tela a pessoa está.
 *
 * Cliente e gestão são observados por caminhos diferentes:
 *
 * - Cliente: não existe socket de pedido do cliente. Reaproveita
 *   `useUserOrders()` (já usado em /orders, mesmo cache do React Query) e
 *   compara o status de cada pedido a cada refetch.
 * - Gestão: abre sua própria conexão ao namespace `/orders` (o mesmo do
 *   `use-kitchen-orders.ts`) só para alimentar o sino. É uma segunda conexão
 *   quando a pessoa também está com a tela da cozinha aberta, mas mantém este
 *   provider isolado da lógica (já delicada) de tempo real da cozinha.
 */

import { KITCHEN_SOCKET_NAMESPACE, type KitchenOrder } from "@/components/kitchen/types";
import { SoundUnlockNotice } from "@/components/notifications/sound-unlock-notice";
import { useAuth } from "@/contexts/auth-provider";
import { useUserOrders } from "@/hooks/use-orders";
import {
  acknowledgeOrder,
  getOrderManagementRoute,
  stopOrderAlerts,
  triggerOrderAlert,
} from "@/lib/order-alerts";
import { notify } from "@/lib/notify";
import { getOrderStatusLabel } from "@/lib/order-status";
import { socketAuthProvider } from "@/lib/socket-auth";
import { soundManager } from "@/lib/sound";
import { apiService, type Order } from "@/services/api";
import { useEffect, useRef, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { toast } from "sonner";

function getSocketUrl(): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "https://bearsystem.tech";
  return `${base}${KITCHEN_SOCKET_NAMESPACE}`;
}

function orderLabel(order: { id: string; orderNumber?: unknown }) {
  return order.orderNumber ?? order.id.slice(0, 8);
}

function CustomerOrderWatcher() {
  const { data: orders } = useUserOrders();
  // null = ainda não carregou a primeira vez; depois disso vira o snapshot
  // conhecido. Sem essa distinção, a primeira carga notificaria "mudança"
  // pro status que já era o estado inicial de cada pedido.
  const knownStatusRef = useRef<Map<string, string> | null>(null);

  useEffect(() => {
    if (!orders) return;

    const known = knownStatusRef.current;

    if (known === null) {
      knownStatusRef.current = new Map(orders.map((order) => [order.id, order.status]));
      return;
    }

    for (const order of orders as Order[]) {
      const previousStatus = known.get(order.id);
      if (previousStatus !== undefined && previousStatus !== order.status) {
        notify({
          audience: "customer",
          title: `Pedido #${orderLabel(order as unknown as { id: string; orderNumber?: unknown })}`,
          body: getOrderStatusLabel(order),
          href: `/order-status?orderId=${order.id}`,
        });
      }
      known.set(order.id, order.status);
    }
  }, [orders]);

  return null;
}

function ManagementOrderWatcher() {
  const { user } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const knownOrderIdsRef = useRef<Set<string>>(new Set());
  const initialSyncDoneRef = useRef<boolean>(false);
  const wasDisconnectedRef = useRef<boolean>(false);

  // 1. Destravar áudio no primeiro clique em qualquer tela + pré-carregar sons da gestão
  useEffect(() => {
    soundManager.preload("restaurant");
  }, []);

  // 2. Carga inicial de pedidos conhecidos para evitar disparar alerta para pedidos que já existiam antes
  useEffect(() => {
    let isMounted = true;

    async function syncKnownOrders() {
      try {
        const response = await apiService.orders.getCompanyOrders({ page: 1, limit: 100 });
        if (isMounted && response.success && response.data?.data) {
          const list = response.data.data as Order[];
          for (const order of list) {
            knownOrderIdsRef.current.add(order.id);
          }
        }
      } catch {
        // Falha no sync inicial degrada para seguir normalmente
      } finally {
        if (isMounted) {
          initialSyncDoneRef.current = true;
        }
      }
    }

    void syncKnownOrders();

    return () => {
      isMounted = false;
    };
  }, []);

  // 3. Conexão socket em tempo real + recuperação de pedidos perdidos durante reconexão
  useEffect(() => {
    const socketUrl = getSocketUrl();
    if (!socketUrl) return;

    // `auth` como função busca token fresco a cada (re)conexão - ver
    // socket-auth.ts. Sem isso, um token expirado numa reconexão automática
    // (depois de uma queda de rede) deixava o sino mudo pra sempre.
    const socket = io(socketUrl, { auth: socketAuthProvider });
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("joinCompanyOrders", undefined, (ack?: { ok?: boolean }) => {
        if (!ack?.ok) {
          toast.error(
            "Não foi possível ativar as notificações de novos pedidos em tempo real.",
          );
        }
      });

      // Se reconectou após uma queda de conexão: buscar pedidos que chegaram durante a queda (LDMF-329)
      if (wasDisconnectedRef.current) {
        wasDisconnectedRef.current = false;
        void (async () => {
          try {
            const response = await apiService.orders.getCompanyOrders({ page: 1, limit: 100 });
            if (response.success && response.data?.data) {
              const list = response.data.data as Order[];
              const missedOrders = list.filter(
                (o) => o.status === "ORDERED" && !knownOrderIdsRef.current.has(o.id),
              );

              for (const order of missedOrders) {
                knownOrderIdsRef.current.add(order.id);
                triggerOrderAlert(order, { role: user?.role });
              }
            }
          } catch {
            // Falha ao recuperar pedidos da queda
          }
        })();
      }
    });

    socket.on("disconnect", () => {
      wasDisconnectedRef.current = true;
    });

    socket.on("connect_error", () => {
      wasDisconnectedRef.current = true;
    });

    socket.on("orderCreated", (order: KitchenOrder) => {
      if (knownOrderIdsRef.current.has(order.id)) return;
      knownOrderIdsRef.current.add(order.id);
      triggerOrderAlert(order, { role: user?.role });
    });

    socket.on("orderStatusUpdated", (order: KitchenOrder) => {
      // Se o pedido avançou ou foi cancelado, remove do conjunto de não atendidos
      if (order.status !== "ORDERED") {
        acknowledgeOrder(order.id);
      }

      if (order.status === "CANCELED") {
        const dest = getOrderManagementRoute(user?.role);
        notify({
          audience: "management",
          title: "Pedido cancelado",
          body: `O pedido #${orderLabel(order)} foi cancelado.`,
          href: dest,
        });
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      stopOrderAlerts();
    };
  }, [user?.role]);

  return null;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isClient, isRestaurantStaff } = useAuth();

  return (
    <>
      {isAuthenticated && isClient() && <CustomerOrderWatcher />}
      {isAuthenticated && isRestaurantStaff() && (
        <>
          <ManagementOrderWatcher />
          <SoundUnlockNotice />
        </>
      )}
      {children}
    </>
  );
}
