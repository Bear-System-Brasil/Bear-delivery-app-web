import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PaymentMethod } from "@/services/api";
import { useFinancialPreferencesStore } from "@/stores";
import SettingsPage from "./page";

// Referência estável: o mock é criado uma vez e só limpo entre os testes.
const toastSuccess = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { success: toastSuccess } }));

vi.mock("@/components/admin-page-layout", () => ({
  AdminPageLayout: ({
    children,
    actions,
  }: {
    children: ReactNode;
    actions?: ReactNode;
  }) => (
    <div>
      {actions}
      {children}
    </div>
  ),
}));

const initialState = useFinancialPreferencesStore.getState();

beforeAll(() => {
  // O Select do Radix usa APIs de ponteiro/rolagem que o jsdom não tem.
  Element.prototype.hasPointerCapture ??= () => false;
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.scrollIntoView ??= () => {};
});

beforeEach(() => {
  toastSuccess.mockClear();
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
  it("oferece só os 4 métodos que o caixa aceita, sem Transferência", () => {
    render(<SettingsPage />);
    openMethodSelect();

    const options = screen.getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual([
      "Dinheiro",
      "PIX",
      "Cartão de Débito",
      "Cartão de Crédito",
    ]);
  });

  it("escolher um método salva na hora", () => {
    render(<SettingsPage />);
    openMethodSelect();
    fireEvent.click(screen.getByRole("option", { name: "PIX" }));

    expect(useFinancialPreferencesStore.getState().defaultPaymentMethod).toBe(
      PaymentMethod.PIX,
    );
    expect(toastSuccess).toHaveBeenCalledTimes(1);
    expect(toastSuccess).toHaveBeenCalledWith("Salvo", expect.any(Object));
  });

  it("customização por operação: fixa método e voltar pro padrão limpa o override (LDMF-463)", () => {
    render(<SettingsPage />);
    fireEvent.click(
      screen.getByRole("button", { name: /Customização por operação/ }),
    );

    // Fixa PIX no Suprimento.
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Suprimento" }), {
      key: "Enter",
    });
    fireEvent.click(screen.getByRole("option", { name: "PIX" }));
    expect(
      useFinancialPreferencesStore.getState().paymentMethodByOperation,
    ).toEqual({ deposit: PaymentMethod.PIX });

    // Voltar pro padrão remove o override (não fica método preso).
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Suprimento" }), {
      key: "Enter",
    });
    fireEvent.click(screen.getByRole("option", { name: "Seguir o padrão" }));
    expect(
      useFinancialPreferencesStore.getState().paymentMethodByOperation,
    ).toEqual({});
  });

  it("mostra o contador de customizadas quando a seção está recolhida (LDMF-463)", () => {
    useFinancialPreferencesStore.setState({
      paymentMethodByOperation: { sale: "PIX", deposit: "none" },
    } as never);
    render(<SettingsPage />);

    // Seção começa recolhida: o contador evita override escondido.
    expect(screen.getByText(/2 customizadas/)).toBeInTheDocument();
  });

  it("Transferência salva antes desta tela aparece como sem seleção, sem reescrever o store", () => {
    useFinancialPreferencesStore.setState({
      defaultPaymentMethod: PaymentMethod.BANK_TRANSFER,
    });
    render(<SettingsPage />);

    expect(
      screen.getByRole("combobox", { name: "Método de pagamento padrão" }),
    ).toHaveTextContent("Selecione um método");
    expect(useFinancialPreferencesStore.getState().defaultPaymentMethod).toBe(
      PaymentMethod.BANK_TRANSFER,
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
    expect(toastSuccess).toHaveBeenCalledWith("Salvo", expect.any(Object));
  });

  it("mudanças seguidas reaproveitam o mesmo toast em vez de empilhar", () => {
    render(<SettingsPage />);
    const toggle = screen.getByRole("switch", {
      name: "Confirmar antes de fechar o caixa",
    });
    fireEvent.click(toggle);
    fireEvent.click(toggle);

    const ids = toastSuccess.mock.calls.map(([, options]) => options.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(1);
  });

  it("restaurar padrão volta os valores e avisa", () => {
    useFinancialPreferencesStore.setState({
      defaultPaymentMethod: PaymentMethod.PIX,
      confirmBeforeCloseRegister: false,
    });
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Restaurar padrão" }));

    const state = useFinancialPreferencesStore.getState();
    expect(state.defaultPaymentMethod).toBe(PaymentMethod.CASH);
    expect(state.confirmBeforeCloseRegister).toBe(true);
    expect(toastSuccess).toHaveBeenCalledWith(
      "Preferências restauradas",
      expect.any(Object),
    );
  });

  it("avisa que salva sozinho e não tem botão Salvar", () => {
    render(<SettingsPage />);

    expect(
      screen.getByText("As alterações são salvas automaticamente"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^salvar/i })).toBeNull();
    expect(screen.queryByText(/não salvas/i)).toBeNull();
  });
});
