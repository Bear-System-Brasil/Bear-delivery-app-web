import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Aviso de som bloqueado (LDMF-458): aparece enquanto o navegador segura o
 * áudio e o som não foi desligado; tocar nele destrava.
 */

const state = { blocked: true, muted: false };
const unlock = vi.fn();

vi.mock("@/lib/sound", () => ({
  soundManager: {
    subscribe: () => () => {},
    isAudioBlocked: () => state.blocked,
    isMuted: () => state.muted,
    watchAudioState: vi.fn(),
    installUnlockHandlers: vi.fn(),
    unlock: () => unlock(),
  },
}));

const { SoundUnlockNotice } = await import("./sound-unlock-notice");

const aviso = () => screen.queryByRole("button", { name: /ativar o som dos pedidos/ });

describe("SoundUnlockNotice (LDMF-458)", () => {
  beforeEach(() => {
    unlock.mockClear();
    state.blocked = true;
    state.muted = false;
  });

  it("com o áudio bloqueado, pede um toque pra ativar o som", () => {
    render(<SoundUnlockNotice />);

    fireEvent.click(aviso()!);

    expect(unlock).toHaveBeenCalled();
  });

  it("com o áudio liberado, não aparece", () => {
    state.blocked = false;
    render(<SoundUnlockNotice />);

    expect(aviso()).not.toBeInTheDocument();
  });

  it("com o som desligado de propósito, não incomoda", () => {
    state.muted = true;
    render(<SoundUnlockNotice />);

    expect(aviso()).not.toBeInTheDocument();
  });
});
