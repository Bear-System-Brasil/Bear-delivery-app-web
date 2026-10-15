import {
  acknowledgeOrder,
  getOrderManagementRoute,
  getUnacknowledgedOrdersCount,
  isOrderUnacknowledged,
  REMINDER_INTERVAL_MS,
  stopOrderAlerts,
  triggerOrderAlert,
} from "./order-alerts";
import { notify } from "@/lib/notify";
import { soundManager } from "@/lib/sound";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notify", () => ({
  notify: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/lib/sound", () => ({
  soundManager: {
    play: vi.fn(),
    stopLoop: vi.fn(),
    isMuted: vi.fn(() => false),
  },
}));

describe("order-alerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopOrderAlerts();
    vi.mocked(soundManager.isMuted).mockReturnValue(false);
  });

  afterEach(() => {
    stopOrderAlerts();
    vi.useRealTimers();
  });

  describe("getOrderManagementRoute", () => {
    it("cook vai para /kitchen", () => {
      expect(getOrderManagementRoute("cook")).toBe("/kitchen");
    });

    it("financial vai para /financial-management/orders", () => {
      expect(getOrderManagementRoute("financial")).toBe(
        "/financial-management/orders",
      );
    });

    it("demais papéis de gestão vão para /kitchen", () => {
      expect(getOrderManagementRoute("manager")).toBe("/kitchen");
      expect(getOrderManagementRoute("admin")).toBe("/kitchen");
      expect(getOrderManagementRoute("owner")).toBe("/kitchen");
      expect(getOrderManagementRoute(undefined)).toBe("/kitchen");
    });
  });

  describe("triggerOrderAlert", () => {
    it("toca som curto e mostra toast com Ver pedido", () => {
      const order = { id: "order-1", orderNumber: 101 };
      triggerOrderAlert(order, { role: "manager" });

      expect(soundManager.play).toHaveBeenCalledWith("new-order");
      expect(isOrderUnacknowledged("order-1")).toBe(true);
      expect(getUnacknowledgedOrdersCount()).toBe(1);

      expect(notify).toHaveBeenCalledWith({
        audience: "management",
        title: "Novo pedido recebido",
        body: "Pedido #101 acabou de chegar.",
        href: "/kitchen",
      });

      expect(toast.info).toHaveBeenCalledWith(
        "Novo pedido recebido #101",
        expect.objectContaining({
          id: "new-order-order-1",
          action: expect.objectContaining({
            label: "Ver pedido",
          }),
        }),
      );
    });

    it("quando o som está desativado (ex: financeiro), não toca som mas mostra toast e notificação", () => {
      vi.mocked(soundManager.isMuted).mockReturnValue(true);
      const order = { id: "order-2", orderNumber: 102 };

      triggerOrderAlert(order, { role: "financial" });

      expect(soundManager.play).not.toHaveBeenCalled();
      expect(notify).toHaveBeenCalledWith({
        audience: "management",
        title: "Novo pedido recebido",
        body: "Pedido #102 acabou de chegar.",
        href: "/financial-management/orders",
      });
      expect(toast.info).toHaveBeenCalled();
    });

    it("repete o som a cada 30 segundos enquanto o pedido não for visto (espaçado, sem loop de 2,8s)", () => {
      vi.useFakeTimers();
      const order = { id: "order-3", orderNumber: 103 };

      triggerOrderAlert(order, { role: "manager" });
      expect(soundManager.play).toHaveBeenCalledTimes(1);

      // Avançar 10 segundos: nada toca
      vi.advanceTimersByTime(10_000);
      expect(soundManager.play).toHaveBeenCalledTimes(1);

      // Avançar até completar 30 segundos: toca repetição espaçada
      vi.advanceTimersByTime(REMINDER_INTERVAL_MS - 10_000);
      expect(soundManager.play).toHaveBeenCalledTimes(2);

      // Avançar mais 30 segundos: toca novamente
      vi.advanceTimersByTime(REMINDER_INTERVAL_MS);
      expect(soundManager.play).toHaveBeenCalledTimes(3);
    });

    it("ao reconhecer o pedido (abrir/clicar), para a repetição imediatamente", () => {
      vi.useFakeTimers();
      const order = { id: "order-4", orderNumber: 104 };

      triggerOrderAlert(order, { role: "cook" });
      expect(soundManager.play).toHaveBeenCalledTimes(1);

      // Reconhecer pedido
      acknowledgeOrder("order-4");
      expect(isOrderUnacknowledged("order-4")).toBe(false);

      // Avançar 60 segundos: nenhum som adicional é tocado
      vi.advanceTimersByTime(60_000);
      expect(soundManager.play).toHaveBeenCalledTimes(1);
    });

    it("clicar em Ver pedido na notificação toast reconhece o pedido e navega", () => {
      const pushMock = vi.fn();
      const order = { id: "order-5", orderNumber: 105 };

      triggerOrderAlert(order, { role: "cook", router: { push: pushMock } });

      const toastCall = vi.mocked(toast.info).mock.calls[0];
      const action = toastCall[1]?.action as { onClick: () => void };

      action.onClick();

      expect(isOrderUnacknowledged("order-5")).toBe(false);
      expect(pushMock).toHaveBeenCalledWith("/kitchen");
    });
  });

  describe("stopOrderAlerts", () => {
    it("limpa todos os pedidos não reconhecidos e cancela repetição", () => {
      vi.useFakeTimers();
      triggerOrderAlert({ id: "o1" });
      triggerOrderAlert({ id: "o2" });
      expect(getUnacknowledgedOrdersCount()).toBe(2);

      stopOrderAlerts();
      expect(getUnacknowledgedOrdersCount()).toBe(0);

      vi.advanceTimersByTime(60_000);
      // Apenas os toques iniciais de cada trigger
      expect(soundManager.play).toHaveBeenCalledTimes(2);
    });
  });
});

