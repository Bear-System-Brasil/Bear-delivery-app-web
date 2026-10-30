/**
 * Gerenciador de alertas de novos pedidos (som, toast e repetição espaçada).
 *
 * Implementa as regras do PO para LDMF-329:
 * 1. Toque curto e visual (toast com "Ver pedido" + sino) ao chegar novo pedido.
 * 2. Nada de loop sem fim em 2,8 s. Repetição espaçada a cada 30 segundos
 *    enquanto houver pedidos novos não visualizados/atendidos.
 * 3. Para imediatamente assim que o pedido for aberto ou o aviso for clicado/dispensado.
 *    "Aberto" = detalhe do pedido na Cozinha ou a notificação no sino. O toast
 *    sumir sozinho não conta: o lembrete segue, sem limite, até alguém ver o
 *    pedido ou ele avançar (decisão do Kauan, LDMF-452).
 * 4. Respeita o perfil do usuário para rota e som:
 *    - cook e papéis de gestão (owner, admin, manager): levam para /kitchen
 *    - financial: leva para /financial-management/orders (mudo por padrão)
 */

import { notify } from "@/lib/notify";
import { soundManager } from "@/lib/sound";
import { useNotificationsStore } from "@/stores/notifications-store";
import { toast } from "sonner";

export const REMINDER_INTERVAL_MS = 30_000;
export const NEW_ORDER_TOAST_ID = "new-order";

const unacknowledgedOrders = new Set<string>();
let reminderInterval: ReturnType<typeof setInterval> | null = null;

function getOrderLabel(order: { id: string; orderNumber?: unknown }) {
  return order.orderNumber != null ? String(order.orderNumber) : order.id.slice(0, 8);
}

export function getOrderManagementRoute(role?: string): string {
  if (role === "financial") return "/financial-management/orders";
  return "/kitchen";
}

function stopReminderTimer() {
  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
  }
}

function startReminderTimer() {
  if (reminderInterval) return;
  reminderInterval = setInterval(() => {
    if (unacknowledgedOrders.size > 0) {
      if (!soundManager.isMuted()) {
        soundManager.play("new-order");
      }
    } else {
      stopReminderTimer();
    }
  }, REMINDER_INTERVAL_MS);
}

export function acknowledgeOrder(orderId: string): void {
  unacknowledgedOrders.delete(orderId);
  // Ver o pedido também tira o "não lida" dele do sino (LDMF-460): sem isso o
  // sino acumulava pedido já visto e as pessoas paravam de olhar pra ele.
  useNotificationsStore.getState().markOrderAsRead(orderId);
  if (unacknowledgedOrders.size === 0) {
    stopReminderTimer();
  }
}

export function stopOrderAlerts(): void {
  unacknowledgedOrders.clear();
  stopReminderTimer();
  soundManager.stopLoop("new-order");
}

export function isOrderUnacknowledged(orderId: string): boolean {
  return unacknowledgedOrders.has(orderId);
}

export function getUnacknowledgedOrdersCount(): number {
  return unacknowledgedOrders.size;
}

interface TriggerOrderAlertOptions {
  role?: string;
  router?: { push: (url: string) => void };
}

export function triggerOrderAlert(
  order: { id: string; orderNumber?: unknown },
  options: TriggerOrderAlertOptions = {},
): void {
  unacknowledgedOrders.add(order.id);

  // 1. Toca som curto imediatamente (se o som não estiver mudo)
  if (!soundManager.isMuted()) {
    soundManager.play("new-order");
  }

  // 2. Inicia repetição espaçada a cada 30 segundos se ainda não ativa
  startReminderTimer();

  // 3. Define rota correta para o perfil
  const targetRoute = getOrderManagementRoute(options.role);
  const label = getOrderLabel(order);

  // Pedidos ainda não vistos, contando este. Numa rajada, o aviso fala de
  // todos de uma vez em vez de empilhar um por pedido (LDMF-461).
  const pendentes = unacknowledgedOrders.size;
  const resumo =
    pendentes > 1
      ? { title: `${pendentes} pedidos novos`, body: `O último é o pedido #${label}.` }
      : null;

  // 4. Alimenta o sino global (uma notificação por pedido, pra cada uma
  //    poder ser marcada como lida) e a notificação nativa do SO/navegador
  //    (que usa uma tag só: a nova substitui a anterior, então ela diz o total)
  notify({
    audience: "management",
    title: "Novo pedido recebido",
    body: `Pedido #${label} acabou de chegar.`,
    href: targetRoute,
    orderId: order.id,
    system: resumo ?? undefined,
  });

  // 5. Toast com ação explícita. Um só, com id fixo: o pedido seguinte
  //    atualiza o mesmo toast em vez de criar outro na pilha.
  const verPedidos = () => {
    for (const id of [...unacknowledgedOrders]) acknowledgeOrder(id);
  };
  toast.info(resumo ? resumo.title : `Novo pedido recebido #${label}`, {
    id: NEW_ORDER_TOAST_ID,
    description: resumo ? resumo.body : `Pedido #${label} acabou de chegar.`,
    action: {
      label: resumo ? "Ver pedidos" : "Ver pedido",
      onClick: () => {
        if (resumo) verPedidos();
        else acknowledgeOrder(order.id);
        if (options.router) {
          options.router.push(targetRoute);
        } else if (typeof window !== "undefined") {
          window.location.href = targetRoute;
        }
      },
    },
    duration: 15_000,
    // Fechar na mão conta como ter visto o que o toast anunciava.
    onDismiss: () => {
      if (resumo) verPedidos();
      else acknowledgeOrder(order.id);
    },
  });
}

