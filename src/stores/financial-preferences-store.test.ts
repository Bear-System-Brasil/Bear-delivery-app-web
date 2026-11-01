import { act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PaymentMethod } from "@/services/api";
import { useFinancialPreferencesStore } from "./financial-preferences-store";

const initialState = useFinancialPreferencesStore.getState();

describe("useFinancialPreferencesStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useFinancialPreferencesStore.setState(initialState, true);
  });

  it("começa com CASH, sem customização por operação e confirmação ativada", () => {
    const state = useFinancialPreferencesStore.getState();
    expect(state.defaultPaymentMethod).toBe(PaymentMethod.CASH);
    expect(state.paymentMethodByOperation).toEqual({});
    expect(state.confirmBeforeCloseRegister).toBe(true);
  });

  it("setOperationMethod grava override por operação (método e sem método)", () => {
    act(() => {
      useFinancialPreferencesStore
        .getState()
        .setOperationMethod("sale", PaymentMethod.PIX);
      useFinancialPreferencesStore
        .getState()
        .setOperationMethod("withdrawal", "none");
    });
    expect(
      useFinancialPreferencesStore.getState().paymentMethodByOperation,
    ).toEqual({ sale: PaymentMethod.PIX, withdrawal: "none" });
  });

  it("setOperationMethod('default') remove o override (volta pro padrão, sem ficar preso)", () => {
    act(() => {
      useFinancialPreferencesStore
        .getState()
        .setOperationMethod("sale", PaymentMethod.PIX);
      useFinancialPreferencesStore
        .getState()
        .setOperationMethod("refund", "none");
    });
    act(() =>
      useFinancialPreferencesStore
        .getState()
        .setOperationMethod("sale", "default"),
    );
    // sale volta a seguir o padrão (chave removida); refund segue customizado.
    expect(
      useFinancialPreferencesStore.getState().paymentMethodByOperation,
    ).toEqual({ refund: "none" });
  });

  it("setDefaultPaymentMethod troca o método pré-selecionado", () => {
    act(() =>
      useFinancialPreferencesStore.getState().setDefaultPaymentMethod(PaymentMethod.PIX),
    );
    expect(useFinancialPreferencesStore.getState().defaultPaymentMethod).toBe(
      PaymentMethod.PIX,
    );
  });

  it("setConfirmBeforeCloseRegister liga/desliga a confirmação extra", () => {
    act(() =>
      useFinancialPreferencesStore.getState().setConfirmBeforeCloseRegister(false),
    );
    expect(useFinancialPreferencesStore.getState().confirmBeforeCloseRegister).toBe(false);
  });

  it("resetFinancialPreferences restaura os defaults e limpa os overrides", () => {
    act(() => {
      useFinancialPreferencesStore.getState().setDefaultPaymentMethod(PaymentMethod.PIX);
      useFinancialPreferencesStore
        .getState()
        .setOperationMethod("sale", PaymentMethod.DEBIT_CARD);
      useFinancialPreferencesStore.getState().setConfirmBeforeCloseRegister(false);
      useFinancialPreferencesStore.getState().resetFinancialPreferences();
    });

    const state = useFinancialPreferencesStore.getState();
    expect(state.defaultPaymentMethod).toBe(PaymentMethod.CASH);
    expect(state.paymentMethodByOperation).toEqual({});
    expect(state.confirmBeforeCloseRegister).toBe(true);
  });

  it("persiste a escolha no localStorage", () => {
    act(() =>
      useFinancialPreferencesStore.getState().setDefaultPaymentMethod(PaymentMethod.DEBIT_CARD),
    );

    const persisted = JSON.parse(
      localStorage.getItem("financial-preferences") ?? "{}",
    );
    expect(persisted.state.defaultPaymentMethod).toBe(PaymentMethod.DEBIT_CARD);
  });
});
