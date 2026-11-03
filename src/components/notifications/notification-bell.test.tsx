import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppNotification } from "@/stores/notifications-store";

/**
 * Abrir a notificacao de pedido novo no sino conta como ver o pedido: tem
 * que parar o lembrete sonoro dele, e nao so marcar como lida (LDMF-452).
 */

const acknowledgeOrder = vi.fn();
const markAsRead = vi.fn();
const push = vi.fn();

vi.mock("@/lib/order-alerts", () => ({
  acknowledgeOrder: (id: string) => acknowledgeOrder(id),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

// Referencias estaveis: mock com identidade nova a cada render causa laco.
const items: AppNotification[] = [
  {
    id: "n1",
    audience: "management",
    title: "Novo pedido recebido",
    body: "Pedido nº 12 acabou de chegar.",
    href: "/kitchen",
    orderId: "order-12",
    createdAt: new Date().toISOString(),
    read: false,
  },
  {
    id: "n2",
    audience: "management",
    title: "Pedido cancelado",
    body: "O pedido nº 9 foi cancelado.",
    href: "/kitchen",
    createdAt: new Date().toISOString(),
    read: false,
  },
];
const notifications = {
  items,
  unreadCount: 2,
  markAsRead,
  markAllAsRead: vi.fn(),
};
const permission = { permission: "granted", requestPermission: vi.fn() };

vi.mock("@/hooks/use-notifications", () => ({
  useNotifications: () => notifications,
  useBrowserNotificationPermission: () => permission,
}));

const { NotificationBell } = await import("./notification-bell");

beforeEach(() => {
  vi.clearAllMocks();
});

const abrirSino = () => {
  render(<NotificationBell audience="management" />);
  fireEvent.click(screen.getByRole("button", { name: /Notificações/ }));
};

describe("NotificationBell - pedido novo (LDMF-452)", () => {
  it("abrir a notificacao do pedido para o lembrete dele e leva pra tela", () => {
    abrirSino();
    fireEvent.click(screen.getByText("Novo pedido recebido"));

    expect(markAsRead).toHaveBeenCalledWith("n1");
    expect(acknowledgeOrder).toHaveBeenCalledWith("order-12");
    expect(push).toHaveBeenCalledWith("/kitchen");
  });

  it("notificacao sem pedido so marca como lida", () => {
    abrirSino();
    fireEvent.click(screen.getByText("Pedido cancelado"));

    expect(markAsRead).toHaveBeenCalledWith("n2");
    expect(acknowledgeOrder).not.toHaveBeenCalled();
  });
});
