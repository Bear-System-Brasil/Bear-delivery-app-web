import { beforeEach, describe, expect, it, vi } from "vitest";

// O config do cliente chama Sentry.init no import: espiona o init e o
// replayIntegration para ver o que ele recebe, sem subir o SDK de verdade.
const init = vi.fn();
const replayIntegration = vi.fn(() => ({ name: "Replay" }));

vi.mock("@sentry/nextjs", () => ({ init, replayIntegration }));

describe("sentry.client.config", () => {
  beforeEach(() => {
    vi.resetModules();
    init.mockClear();
    replayIntegration.mockClear();
  });

  it("nao liga o Session Replay (gravava a tela o tempo todo; LDMF-477)", async () => {
    await import("../../sentry.client.config");

    expect(init).toHaveBeenCalledTimes(1);
    const opcoes = init.mock.calls[0][0];

    expect(replayIntegration).not.toHaveBeenCalled();
    expect(opcoes.replaysOnErrorSampleRate).toBeUndefined();
    expect(opcoes.replaysSessionSampleRate).toBeUndefined();
    const nomes = (opcoes.integrations ?? []).map((i: { name: string }) => i.name);
    expect(nomes).not.toContain("Replay");
  });

  it("continua capturando erro: liga o SDK quando ha DSN", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://chave@o0.ingest.sentry.io/0");
    await import("../../sentry.client.config");

    expect(init.mock.calls[0][0].enabled).toBe(true);
    vi.unstubAllEnvs();
  });
});
