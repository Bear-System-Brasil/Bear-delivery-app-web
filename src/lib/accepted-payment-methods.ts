import { PaymentMethod } from "@/services/api";

/**
 * Formas que o restaurante pode aceitar (LDMF-251 / LDMF-289, company.md
 * seção 5). `BANK_TRANSFER` existe no enum do pagamento mas fica de fora:
 * o PATCH /company/:id recusa com 400 PAYMENT_METHODS_INVALID.
 */
export const ACCEPTED_PAYMENT_METHODS = [
  PaymentMethod.CASH,
  PaymentMethod.CREDIT_CARD,
  PaymentMethod.DEBIT_CARD,
  PaymentMethod.PIX,
] as const;

export type AcceptedPaymentMethod = (typeof ACCEPTED_PAYMENT_METHODS)[number];

/** Rótulos iguais aos do checkout, para o dono ver o que o cliente vê. */
export const ACCEPTED_PAYMENT_METHOD_LABELS: Record<
  AcceptedPaymentMethod,
  string
> = {
  [PaymentMethod.CASH]: "Dinheiro",
  [PaymentMethod.CREDIT_CARD]: "Crédito na maquininha",
  [PaymentMethod.DEBIT_CARD]: "Débito na maquininha",
  [PaymentMethod.PIX]: "Pix na entrega",
};

/**
 * Lê `acceptedPaymentMethods` de GET /company/:id.
 *
 * Campo ausente, que não é lista ou sem nenhuma forma conhecida vira "todas
 * as formas": é o padrão do backend para empresa que nunca configurou, e
 * esconder tudo deixaria o cliente sem como pagar. Valor desconhecido é
 * descartado. A ordem segue ACCEPTED_PAYMENT_METHODS, não a da resposta.
 */
export function resolveAcceptedPaymentMethods(
  value: unknown,
): AcceptedPaymentMethod[] {
  if (!Array.isArray(value)) return [...ACCEPTED_PAYMENT_METHODS];

  const accepted = ACCEPTED_PAYMENT_METHODS.filter((method) =>
    value.includes(method),
  );

  return accepted.length > 0 ? accepted : [...ACCEPTED_PAYMENT_METHODS];
}

/**
 * Traduz os erros documentados do PATCH. O formato exato do corpo de erro
 * não está na doc, então procura o código dentro da mensagem e, sem achar,
 * devolve a mensagem do backend como veio.
 */
export function getAcceptedPaymentMethodsErrorMessage(
  message: string | undefined,
): string {
  if (message?.includes("PAYMENT_METHODS_EMPTY")) {
    return "Escolha pelo menos uma forma de pagamento.";
  }
  if (message?.includes("PAYMENT_METHODS_INVALID")) {
    return "Forma de pagamento inválida ou repetida.";
  }
  return message || "Erro ao salvar as formas de pagamento.";
}
