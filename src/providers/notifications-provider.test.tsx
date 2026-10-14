import { NotificationsProvider } from "./notifications-provider";
import { useAuth } from "@/contexts/auth-provider";
import * as orderAlerts from "@/lib/order-alerts";
import { soundManager } from "@/lib/sound";
import { apiService } from "@/services/api";
import { render, waitFor } from "@testing-library/react";
import { io } from "socket.io-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/contexts/auth-provider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/use-orders", () => ({
  useUserOrders: vi.fn(() => ({ data: [] })),
}));

vi.mock("@/lib/sound", () => ({
  soundManager: {
    preload: vi.fn(),
    play: vi.fn(),
    isMuted: vi.fn(() => false),
    subscribe: vi.fn(() => () => {}),
  },
}));

vi.mock("@/lib/order-alerts", () => ({
  triggerOrderAlert: vi.fn(),
  acknowledgeOrder: vi.fn(),
  stopOrderAlerts: vi.fn(),
  getOrderManagementRoute: vi.fn((role) => (role === "cook" ? "/kitchen" : "/order-management")),
}));

vi.mock("@/services/api", () => ({
  apiService: {
    orders: {
      getCompanyOrders: vi.fn(),
    },
  },
}));

vi.mock("socket.io-client", () => {
  return {
    io: vi.fn(),
  };
});

describe("NotificationsProvider & ManagementOrderWatcher", () => {
  let fakeSocket: {
    on: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    callbacks: Record<string, ((...args: unknown[]) => void)[]>;
    fire: (event: string, ...args: unknown[]) => void;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    fakeSocket = {
      callbacks: {},
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        if (!fakeSocket.callbacks[event]) fakeSocket.callbacks[event] = [];
        fakeSocket.callbacks[event].push(cb);
        return fakeSocket;
      }),
      emit: vi.fn((_event: string, _payload: unknown, ack?: (res: { ok: boolean }) => void) => {
        if (ack) ack({ ok: true });
        return fakeSocket;
      }),
      disconnect: vi.fn(),
      fire: (event: string, ...args: unknown[]) => {
        fakeSocket.callbacks[event]?.forEach((cb) => cb(...args));
      },
    };

    vi.mocked(io).mockReturnValue(fakeSocket as unknown as ReturnType<typeof io>);
    vi.mocked(apiService.orders.getCompanyOrders).mockResolvedValue({
      success: true,
      data: {
        data: [{ id: "existing-1", status: "ORDERED" } as unknown],
      },
    } as unknown as Awaited<ReturnType<typeof apiService.orders.getCompanyOrders>>);
  });

  it("renderiza ManagementOrderWatcher para cozinheiro (cook) e precarrega som", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: "u-cook", role: "cook" },
      isClient: () => false,
      isRestaurantStaff: () => true,
    } as unknown as ReturnType<typeof useAuth>);

    render(
      <NotificationsProvider>
        <div>Filho</div>
      </NotificationsProvider>,
    );

    expect(soundManager.preload).toHaveBeenCalledWith("restaurant");
    expect(io).toHaveBeenCalled();
  });

  it("renderiza ManagementOrderWatcher para perfil financeiro", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: "u-fin", role: "financial" },
      isClient: () => false,
      isRestaurantStaff: () => true,
    } as unknown as ReturnType<typeof useAuth>);

    render(
      <NotificationsProvider>
        <div>Filho</div>
      </NotificationsProvider>,
    );

    expect(io).toHaveBeenCalled();
  });

  it("não renderiza ManagementOrderWatcher para cliente", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: "u-client", role: "client" },
      isClient: () => true,
      isRestaurantStaff: () => false,
    } as unknown as ReturnType<typeof useAuth>);

    render(
      <NotificationsProvider>
        <div>Filho</div>
      </NotificationsProvider>,
    );

    expect(io).not.toHaveBeenCalled();
  });

  it("sincroniza pedidos existentes no boot para não alertar pedidos antigos", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: "u-manager", role: "manager" },
      isClient: () => false,
      isRestaurantStaff: () => true,
    } as unknown as ReturnType<typeof useAuth>);

    render(
      <NotificationsProvider>
        <div>Filho</div>
      </NotificationsProvider>,
    );

    await waitFor(() => {
      expect(apiService.orders.getCompanyOrders).toHaveBeenCalled();
    });

    // Se chegar evento de um pedido que já existia no sync inicial, não alerta
    fakeSocket.fire("orderCreated", { id: "existing-1", status: "ORDERED" });
    expect(orderAlerts.triggerOrderAlert).not.toHaveBeenCalled();
  });

  it("dispara alerta para novo pedido recebido via socket", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: "u-manager", role: "manager" },
      isClient: () => false,
      isRestaurantStaff: () => true,
    } as unknown as ReturnType<typeof useAuth>);

    render(
      <NotificationsProvider>
        <div>Filho</div>
      </NotificationsProvider>,
    );

    await waitFor(() => {
      expect(apiService.orders.getCompanyOrders).toHaveBeenCalled();
    });

    fakeSocket.fire("orderCreated", { id: "new-order-99", orderNumber: 99, status: "ORDERED" });

    expect(orderAlerts.triggerOrderAlert).toHaveBeenCalledWith(
      expect.objectContaining({ id: "new-order-99" }),
      expect.objectContaining({ role: "manager" }),
    );
  });

  it("recupera pedidos perdidos durante queda de conexão ao reconectar", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: "u-cook", role: "cook" },
      isClient: () => false,
      isRestaurantStaff: () => true,
    } as unknown as ReturnType<typeof useAuth>);

    render(
      <NotificationsProvider>
        <div>Filho</div>
      </NotificationsProvider>,
    );

    await waitFor(() => {
      expect(apiService.orders.getCompanyOrders).toHaveBeenCalled();
    });

    // Queda de conexão
    fakeSocket.fire("disconnect");

    // Simulando que durante a queda um novo pedido ORDERED chegou ao banco
    vi.mocked(apiService.orders.getCompanyOrders).mockResolvedValue({
      success: true,
      data: {
        data: [
          { id: "existing-1", status: "ORDERED" },
          { id: "missed-during-drop", orderNumber: 55, status: "ORDERED" },
        ] as unknown,
      },
    } as unknown as Awaited<ReturnType<typeof apiService.orders.getCompanyOrders>>);

    // Reconexão ("Ao vivo")
    fakeSocket.fire("connect");

    await waitFor(() => {
      expect(orderAlerts.triggerOrderAlert).toHaveBeenCalledWith(
        expect.objectContaining({ id: "missed-during-drop" }),
        expect.objectContaining({ role: "cook" }),
      );
    });
  });

  it("remove alerta ativo quando o pedido avança de status", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: "u-manager", role: "manager" },
      isClient: () => false,
      isRestaurantStaff: () => true,
    } as unknown as ReturnType<typeof useAuth>);

    render(
      <NotificationsProvider>
        <div>Filho</div>
      </NotificationsProvider>,
    );

    fakeSocket.fire("orderStatusUpdated", { id: "order-123", status: "IN_PRODUCTION" });

    expect(orderAlerts.acknowledgeOrder).toHaveBeenCalledWith("order-123");
  });

  it("desmontar o provider desconecta o socket e para os alertas", async () => {
    vi.mocked(useAuth).mockReturnValue({
      isAuthenticated: true,
      user: { id: "u-manager", role: "manager" },
      isClient: () => false,
      isRestaurantStaff: () => true,
    } as unknown as ReturnType<typeof useAuth>);

    const { unmount } = render(
      <NotificationsProvider>
        <div>Filho</div>
      </NotificationsProvider>,
    );

    unmount();

    expect(fakeSocket.disconnect).toHaveBeenCalled();
    expect(orderAlerts.stopOrderAlerts).toHaveBeenCalled();
  });
});
