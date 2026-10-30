import { beforeEach, describe, expect, it, vi } from "vitest";
import { notify } from "./notify";
import { showBrowserNotification } from "@/lib/browser-notifications";
import { useNotificationsStore } from "@/stores/notifications-store";
import { usePreferencesStore } from "@/stores/preferences-store";

vi.mock("@/lib/browser-notifications", () => ({
  showBrowserNotification: vi.fn(),
}));

const initialNotifications = useNotificationsStore.getState();

describe("notify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useNotificationsStore.setState(initialNotifications, true);
    usePreferencesStore.setState((state) => ({
      notifications: { ...state.notifications, push: true },
    }));
  });

  it("o popup do SO pode ter texto próprio; o sino guarda o da notificação (LDMF-461)", () => {
    notify({
      audience: "management",
      title: "Novo pedido recebido",
      body: "Pedido #12 acabou de chegar.",
      href: "/kitchen",
      orderId: "o12",
      system: { title: "3 pedidos novos", body: "O último é o pedido #12." },
    });

    expect(showBrowserNotification).toHaveBeenCalledWith("3 pedidos novos", {
      body: "O último é o pedido #12.",
      href: "/kitchen",
    });
    const [item] = useNotificationsStore.getState().items;
    expect(item).toEqual(
      expect.objectContaining({ title: "Novo pedido recebido", orderId: "o12" }),
    );
  });

  it("sem texto próprio, o popup repete a notificação", () => {
    notify({ audience: "customer", title: "Pedido #3", body: "Saiu pra entrega" });

    expect(showBrowserNotification).toHaveBeenCalledWith("Pedido #3", {
      body: "Saiu pra entrega",
      href: undefined,
    });
  });
});
