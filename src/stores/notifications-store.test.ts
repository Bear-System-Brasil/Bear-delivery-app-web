import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore, type User } from "./auth-store";
import { useNotificationsStore } from "./notifications-store";
import { STORAGE_KEYS } from "@/utils/storage-manager";

const initialState = useNotificationsStore.getState();

describe("useNotificationsStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useNotificationsStore.setState(initialState, true);
  });

  it("começa sem notificações", () => {
    expect(useNotificationsStore.getState().items).toEqual([]);
  });

  it("addNotification insere no topo da lista, gera id/createdAt e começa como não lida", () => {
    act(() =>
      useNotificationsStore.getState().addNotification({
        audience: "customer",
        title: "Pedido confirmado",
        body: "Seu pedido foi confirmado",
      }),
    );

    const [item] = useNotificationsStore.getState().items;
    expect(item.title).toBe("Pedido confirmado");
    expect(item.read).toBe(false);
    expect(item.id).toBeTruthy();
    expect(new Date(item.createdAt).toString()).not.toBe("Invalid Date");
  });

  it("notificações novas entram sempre na frente (mais recente primeiro)", () => {
    act(() => {
      useNotificationsStore.getState().addNotification({
        audience: "customer",
        title: "Primeira",
        body: "...",
      });
      useNotificationsStore.getState().addNotification({
        audience: "customer",
        title: "Segunda",
        body: "...",
      });
    });

    const items = useNotificationsStore.getState().items;
    expect(items.map((i) => i.title)).toEqual(["Segunda", "Primeira"]);
  });

  it("mantém no máximo 50 notificações, descartando as mais antigas", () => {
    act(() => {
      for (let i = 0; i < 55; i++) {
        useNotificationsStore.getState().addNotification({
          audience: "management",
          title: `Notificação ${i}`,
          body: "...",
        });
      }
    });

    const items = useNotificationsStore.getState().items;
    expect(items).toHaveLength(50);
    // as 5 primeiras (mais antigas) devem ter sido descartadas
    expect(items[items.length - 1].title).toBe("Notificação 5");
    expect(items[0].title).toBe("Notificação 54");
  });

  it("markAsRead marca só a notificação com o id indicado", () => {
    act(() => {
      useNotificationsStore.getState().addNotification({
        audience: "customer",
        title: "A",
        body: "...",
      });
      useNotificationsStore.getState().addNotification({
        audience: "customer",
        title: "B",
        body: "...",
      });
    });

    const [unreadTarget] = useNotificationsStore.getState().items;
    act(() => useNotificationsStore.getState().markAsRead(unreadTarget.id));

    const items = useNotificationsStore.getState().items;
    expect(items.find((i) => i.id === unreadTarget.id)?.read).toBe(true);
    expect(items.filter((i) => i.read)).toHaveLength(1);
  });

  it("markAllAsRead sem audiência marca tudo", () => {
    act(() => {
      useNotificationsStore.getState().addNotification({ audience: "customer", title: "A", body: "" });
      useNotificationsStore.getState().addNotification({ audience: "management", title: "B", body: "" });
      useNotificationsStore.getState().markAllAsRead();
    });

    expect(useNotificationsStore.getState().items.every((i) => i.read)).toBe(true);
  });

  it("markAllAsRead com audiência só afeta aquela audiência", () => {
    act(() => {
      useNotificationsStore.getState().addNotification({ audience: "customer", title: "A", body: "" });
      useNotificationsStore.getState().addNotification({ audience: "management", title: "B", body: "" });
      useNotificationsStore.getState().markAllAsRead("customer");
    });

    const items = useNotificationsStore.getState().items;
    expect(items.find((i) => i.audience === "customer")?.read).toBe(true);
    expect(items.find((i) => i.audience === "management")?.read).toBe(false);
  });

  it("clearAll sem audiência remove tudo", () => {
    act(() => {
      useNotificationsStore.getState().addNotification({ audience: "customer", title: "A", body: "" });
      useNotificationsStore.getState().clearAll();
    });

    expect(useNotificationsStore.getState().items).toEqual([]);
  });

  it("clearAll com audiência remove só daquela audiência", () => {
    act(() => {
      useNotificationsStore.getState().addNotification({ audience: "customer", title: "A", body: "" });
      useNotificationsStore.getState().addNotification({ audience: "management", title: "B", body: "" });
      useNotificationsStore.getState().clearAll("customer");
    });

    const items = useNotificationsStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].audience).toBe("management");
  });
});

const initialAuthState = useAuthStore.getState();

function makeUser(id: string): User {
  return {
    id,
    name: `Conta ${id}`,
    email: `${id}@example.com`,
    cpf: "",
    phone: "",
    birthDate: "",
    role: "client",
  };
}

function notifyPedido(title: string) {
  useNotificationsStore.getState().addNotification({
    audience: "customer",
    title,
    body: "...",
    href: "/orders/1",
  });
}

const titles = () =>
  useNotificationsStore.getState().items.map((item) => item.title);

describe("notificações x sessão (LDMF-244)", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState(initialAuthState, true);
    useNotificationsStore.setState(initialState, true);
  });

  afterEach(() => {
    useAuthStore.getState().logout();
  });

  it("conta B não vê o feed da A", () => {
    useAuthStore.getState().login(makeUser("a"));
    notifyPedido("Pedido da A saiu para entrega");
    useAuthStore.getState().logout();

    useAuthStore.getState().login(makeUser("b"));

    expect(titles()).toEqual([]);
  });

  it("troca direta de conta, sem passar pelo logout, também separa", () => {
    useAuthStore.getState().login(makeUser("a"));
    notifyPedido("Pedido da A");

    useAuthStore.getState().login(makeUser("b"));

    expect(titles()).toEqual([]);
  });

  it("logout tira do sino o feed da conta que saiu", () => {
    useAuthStore.getState().login(makeUser("a"));
    notifyPedido("Pedido da A");

    useAuthStore.getState().logout();

    expect(titles()).toEqual([]);
  });

  it("conta A reencontra o próprio feed, com o que já tinha lido", () => {
    useAuthStore.getState().login(makeUser("a"));
    notifyPedido("Pedido da A");
    useNotificationsStore.getState().markAllAsRead();
    useAuthStore.getState().logout();
    useAuthStore.getState().login(makeUser("b"));
    notifyPedido("Pedido da B");
    useAuthStore.getState().logout();

    useAuthStore.getState().login(makeUser("a"));

    const items = useNotificationsStore.getState().items;
    expect(items.map((item) => item.title)).toEqual(["Pedido da A"]);
    expect(items[0].read).toBe(true);
  });

  it("feed sem login não passa para a conta que entra", () => {
    notifyPedido("Sem login");

    useAuthStore.getState().login(makeUser("a"));

    expect(titles()).toEqual([]);
  });

  it("persiste o feed no localStorage, separado por conta", () => {
    useAuthStore.getState().login(makeUser("a"));
    notifyPedido("Pedido da A");

    const raw = JSON.parse(
      localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS) as string,
    );
    expect(Object.keys(raw.state.byUser)).toEqual(["a"]);
    expect(raw.state.items).toBeUndefined();
  });
});

describe("migração do feed sem dono (v0)", () => {
  // Recarrega os módulos pra hidratar a partir do localStorage, como no boot
  async function boot(auth: User | null) {
    localStorage.clear();
    localStorage.setItem(
      STORAGE_KEYS.NOTIFICATIONS,
      JSON.stringify({
        state: {
          items: [
            {
              id: "n1",
              audience: "customer",
              title: "Antiga",
              body: "...",
              createdAt: "2026-01-01T00:00:00.000Z",
              read: false,
            },
          ],
        },
        version: 0,
      }),
    );
    if (auth) {
      localStorage.setItem(
        STORAGE_KEYS.AUTH,
        JSON.stringify({
          state: { user: auth, isAuthenticated: true },
          version: 1,
        }),
      );
    }
    vi.resetModules();
    const { useNotificationsStore: fresh } = await import(
      "./notifications-store"
    );
    return fresh.getState();
  }

  it("fica com a conta logada no boot", async () => {
    const state = await boot(makeUser("a"));

    expect(state.items.map((item) => item.title)).toEqual(["Antiga"]);
    expect(Object.keys(state.byUser)).toEqual(["a"]);
  });

  it("sem ninguém logado, é descartado", async () => {
    const state = await boot(null);

    expect(state.items).toEqual([]);
    expect(state.byUser).toEqual({});
  });
});
