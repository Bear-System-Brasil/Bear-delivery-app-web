import {
  acknowledgeOrder,
  getOrderManagementRoute,
  getUnacknowledgedOrdersCount,
  isOrderUnacknowledged,
  NEW_ORDER_TOAST_ID,
  REMINDER_INTERVAL_MS,
  stopOrderAlerts,
  triggerOrderAlert,
} from "./order-alerts";
import { notify } from "@/lib/notify";
import { soundManager } from "@/lib/sound";
import { useNotificationsStore } from "@/stores/notifications-store";
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
        orderId: "order-1",
      });

      expect(toast.info).toHaveBeenCalledWith(
        "Novo pedido recebido #101",
        expect.objectContaining({
          id: NEW_ORDER_TOAST_ID,
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
        orderId: "order-2",
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

  describe("lembrete depois que o toast some (LDMF-452)", () => {
    it("o toast sumir sozinho nao para o lembrete: segue ate alguem ver o pedido", () => {
      vi.useFakeTimers();
      triggerOrderAlert({ id: "order-6", orderNumber: 106 }, { role: "manager" });

      // O auto-close do sonner (15s) nao chama onDismiss: so o fechamento
      // manual chama. Passados 15s, o pedido continua sem ser visto.
      vi.advanceTimersByTime(15_000);
      expect(isOrderUnacknowledged("order-6")).toBe(true);

      vi.advanceTimersByTime(REMINDER_INTERVAL_MS * 4);
      expect(soundManager.play).toHaveBeenCalledTimes(1 + 4);

      acknowledgeOrder("order-6");
      vi.advanceTimersByTime(REMINDER_INTERVAL_MS * 2);
      expect(soundManager.play).toHaveBeenCalledTimes(1 + 4);
    });

    it("fechar o toast na mao conta como ver e para o lembrete", () => {
      vi.useFakeTimers();
      triggerOrderAlert({ id: "order-7", orderNumber: 107 }, { role: "manager" });

      const opcoes = vi.mocked(toast.info).mock.calls[0][1] as { onDismiss: () => void };
      opcoes.onDismiss();

      vi.advanceTimersByTime(REMINDER_INTERVAL_MS * 2);
      expect(soundManager.play).toHaveBeenCalledTimes(1);
    });
  });

  describe("rajada de pedidos (LDMF-461)", () => {
    const ultimoToast = () => vi.mocked(toast.info).mock.calls.at(-1)!;

    it("um toast só, que passa a dizer quantos pedidos esperam", () => {
      triggerOrderAlert({ id: "r1", orderNumber: 201 }, { role: "manager" });
      triggerOrderAlert({ id: "r2", orderNumber: 202 }, { role: "manager" });
      triggerOrderAlert({ id: "r3", orderNumber: 203 }, { role: "manager" });

      const ids = vi.mocked(toast.info).mock.calls.map(([, o]) => o?.id);
      expect(new Set(ids)).toEqual(new Set([NEW_ORDER_TOAST_ID]));

      const [titulo, opcoes] = ultimoToast();
      expect(titulo).toBe("3 pedidos novos");
      expect(opcoes?.description).toBe("O último é o pedido #203.");
      expect((opcoes?.action as { label: string }).label).toBe("Ver pedidos");
    });

    it("a notificação do SO diz o total; o sino continua com uma por pedido", () => {
      triggerOrderAlert({ id: "r1", orderNumber: 201 }, { role: "manager" });
      triggerOrderAlert({ id: "r2", orderNumber: 202 }, { role: "manager" });

      expect(vi.mocked(notify).mock.calls[0][0].system).toBeUndefined();
      expect(vi.mocked(notify).mock.calls[1][0]).toEqual(
        expect.objectContaining({
          orderId: "r2",
          system: { title: "2 pedidos novos", body: "O último é o pedido #202." },
        }),
      );
    });

    it("Ver pedidos reconhece todos e para o lembrete", () => {
      vi.useFakeTimers();
      triggerOrderAlert({ id: "r1", orderNumber: 201 }, { role: "manager", router: { push: vi.fn() } });
      triggerOrderAlert({ id: "r2", orderNumber: 202 }, { role: "manager", router: { push: vi.fn() } });

      (ultimoToast()[1]?.action as { onClick: () => void }).onClick();

      expect(getUnacknowledgedOrdersCount()).toBe(0);
      vi.advanceTimersByTime(REMINDER_INTERVAL_MS * 2);
      expect(soundManager.play).toHaveBeenCalledTimes(2);
    });

    it("pedido sozinho continua com o texto e a ação de antes", () => {
      triggerOrderAlert({ id: "r1", orderNumber: 201 }, { role: "manager" });

      const [titulo, opcoes] = ultimoToast();
      expect(titulo).toBe("Novo pedido recebido #201");
      expect((opcoes?.action as { label: string }).label).toBe("Ver pedido");
    });
  });

  describe("sino (LDMF-460)", () => {
    it("ver o pedido marca a notificação dele como lida no sino", () => {
      const markOrderAsRead = vi.spyOn(useNotificationsStore.getState(), "markOrderAsRead");
      triggerOrderAlert({ id: "order-8", orderNumber: 108 }, { role: "manager" });

      acknowledgeOrder("order-8");

      expect(markOrderAsRead).toHaveBeenCalledWith("order-8");
      markOrderAsRead.mockRestore();
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

