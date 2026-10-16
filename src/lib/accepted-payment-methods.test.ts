import { describe, expect, it } from "vitest";
import {
  ACCEPTED_PAYMENT_METHODS,
  getAcceptedPaymentMethodsErrorMessage,
  resolveAcceptedPaymentMethods,
} from "./accepted-payment-methods";

describe("resolveAcceptedPaymentMethods", () => {
  it("sem o campo, aceita todas as formas", () => {
    expect(resolveAcceptedPaymentMethods(undefined)).toEqual([
      ...ACCEPTED_PAYMENT_METHODS,
    ]);
    expect(resolveAcceptedPaymentMethods(null)).toEqual([
      ...ACCEPTED_PAYMENT_METHODS,
    ]);
  });

  it("devolve só as formas da lista, na ordem fixa", () => {
    expect(resolveAcceptedPaymentMethods(["PIX", "CASH"])).toEqual([
      "CASH",
      "PIX",
    ]);
  });

  it("descarta valor desconhecido, inclusive BANK_TRANSFER", () => {
    expect(
      resolveAcceptedPaymentMethods(["DEBIT_CARD", "BANK_TRANSFER", "BOLETO"]),
    ).toEqual(["DEBIT_CARD"]);
  });

  it("lista vazia ou sem forma conhecida volta para todas", () => {
    expect(resolveAcceptedPaymentMethods([])).toEqual([
      ...ACCEPTED_PAYMENT_METHODS,
    ]);
    expect(resolveAcceptedPaymentMethods(["BOLETO"])).toEqual([
      ...ACCEPTED_PAYMENT_METHODS,
    ]);
  });
});

describe("getAcceptedPaymentMethodsErrorMessage", () => {
  it("traduz os códigos documentados", () => {
    expect(getAcceptedPaymentMethodsErrorMessage("PAYMENT_METHODS_EMPTY")).toBe(
      "Escolha pelo menos uma forma de pagamento.",
    );
    expect(
      getAcceptedPaymentMethodsErrorMessage(
        "acceptedPaymentMethods: PAYMENT_METHODS_INVALID",
      ),
    ).toBe("Forma de pagamento inválida ou repetida.");
  });

  it("sem código conhecido, devolve a mensagem do backend", () => {
    expect(getAcceptedPaymentMethodsErrorMessage("Sem permissão")).toBe(
      "Sem permissão",
    );
    expect(getAcceptedPaymentMethodsErrorMessage(undefined)).toBe(
      "Erro ao salvar as formas de pagamento.",
    );
  });
});
