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

