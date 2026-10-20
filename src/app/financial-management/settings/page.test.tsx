import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentMethod } from "@/services/api";
import { useFinancialPreferencesStore } from "@/stores";
import SettingsPage from "./page";

vi.mock("@/components/admin-page-layout", () => ({
  AdminPageLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const initialState = useFinancialPreferencesStore.getState();

beforeAll(() => {
  // O Select do Radix usa APIs de ponteiro/rolagem que o jsdom não tem.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  localStorage.clear();
  useFinancialPreferencesStore.setState(initialState, true);
});

function openMethodSelect() {
  fireEvent.keyDown(
    screen.getByRole("combobox", { name: "Método de pagamento padrão" }),
    { key: "Enter" },
  );
}

describe("Configurações do financeiro", () => {
  it("escolher um método salva na hora", () => {
    render(<SettingsPage />);
    openMethodSelect();
    fireEvent.click(screen.getByRole("option", { name: "PIX" }));

    expect(useFinancialPreferencesStore.getState().defaultPaymentMethod).toBe(
      PaymentMethod.PIX,
    );
  });

  it("o toggle liga e desliga a confirmação de fechamento na hora", () => {
    render(<SettingsPage />);
    const toggle = screen.getByRole("switch", {
      name: "Confirmar antes de fechar o caixa",
    });

    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
    expect(useFinancialPreferencesStore.getState().confirmBeforeCloseRegister).toBe(
      false,
    );
  });
});
