import { soundManager } from "./sound-manager";
import { useAuthStore, type User } from "@/stores/auth-store";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("SoundManager", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset private fields if needed
    soundManager.setMuted(false);
    localStorage.clear();
  });

  it("começa com som ligado por padrão para papéis normais (LDMF-329)", () => {
    useAuthStore.setState({
      user: { id: "u-cook", role: "cook" } as User,
    });
    localStorage.removeItem("like:sound-muted");
    (soundManager as unknown as { hydrated: boolean }).hydrated = false;

    expect(soundManager.isMuted()).toBe(false);
  });

  it("começa mudo por padrão para o perfil financeiro (LDMF-329)", () => {
    useAuthStore.setState({
      user: { id: "u-fin", role: "financial" } as User,
    });
    localStorage.removeItem("like:sound-muted");
    (soundManager as unknown as { hydrated: boolean }).hydrated = false;

    expect(soundManager.isMuted()).toBe(true);
  });

  it("respeita preferência gravada em localStorage sobrepondo padrão do papel", () => {
    useAuthStore.setState({
      user: { id: "u-fin", role: "financial" } as User,
    });
    localStorage.setItem("like:sound-muted", "0");
    (soundManager as unknown as { hydrated: boolean }).hydrated = false;

    expect(soundManager.isMuted()).toBe(false);
  });

  it("setMuted grava no localStorage e notifica assinantes", () => {
    const listener = vi.fn();
    const unsubscribe = soundManager.subscribe(listener);

    soundManager.setMuted(true);
    expect(soundManager.isMuted()).toBe(true);
    expect(localStorage.getItem("like:sound-muted")).toBe("1");
    expect(listener).toHaveBeenCalled();

    unsubscribe();
  });
});


describe("SoundManager - áudio bloqueado pelo navegador (LDMF-458)", () => {
  it("acompanha o estado do AudioContext e avisa quem assina", () => {
    // AudioContext mínimo: o jsdom não tem Web Audio.
    let onStateChange: () => void = () => {};
    const ctx = {
      state: "suspended",
      destination: {},
      createGain: () => ({ connect: vi.fn(), gain: { value: 1 } }),
      addEventListener: (_evt: string, cb: () => void) => {
        onStateChange = cb;
      },
    };
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          return ctx;
        }
      },
    );
    const listener = vi.fn();
    const unsubscribe = soundManager.subscribe(listener);

    // Chrome sem toque na página: o contexto nasce suspenso.
    soundManager.watchAudioState();
    expect(soundManager.isAudioBlocked()).toBe(true);

    // O primeiro toque destrava.
    ctx.state = "running";
    onStateChange();
    expect(soundManager.isAudioBlocked()).toBe(false);
    expect(listener).toHaveBeenCalled();

    unsubscribe();
    vi.unstubAllGlobals();
  });
});
