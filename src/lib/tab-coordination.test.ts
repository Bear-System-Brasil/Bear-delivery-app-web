import { afterEach, describe, expect, it, vi } from "vitest";
import { runInOneTab } from "./tab-coordination";

/**
 * Web Locks mínima: o jsdom não tem `navigator.locks`. Uma trava por nome,
 * e `ifAvailable` entrega `null` se ela estiver presa - como no navegador.
 */
function installFakeLocks() {
  const held = new Set<string>();
  const request = vi.fn(
    async (name: string, _opts: { ifAvailable: boolean }, cb: (lock: object | null) => Promise<void>) => {
      if (held.has(name)) return cb(null);
      held.add(name);
      try {
        return await cb({ name });
      } finally {
        held.delete(name);
      }
    },
  );
  Object.defineProperty(navigator, "locks", { value: { request }, configurable: true });
  return request;
}

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("runInOneTab (LDMF-459)", () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, "locks");
  });

  it("o mesmo evento chegando a duas abas executa uma vez só", async () => {
    installFakeLocks();
    const fn = vi.fn();

    // Duas abas recebendo o mesmo pedido pelo socket, quase ao mesmo tempo.
    runInOneTab("sound:new-order", 50, fn);
    runInOneTab("sound:new-order", 50, fn);
    await espera(10);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("depois de soltar a trava, o próximo evento executa de novo", async () => {
    installFakeLocks();
    const fn = vi.fn();

    runInOneTab("sound:new-order", 20, fn);
    await espera(40);
    runInOneTab("sound:new-order", 20, fn);
    await espera(10);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("sem Web Locks no navegador, executa como antes", () => {
    const fn = vi.fn();

    runInOneTab("sound:new-order", 50, fn);

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
