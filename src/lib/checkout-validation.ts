import { isValidCpf, onlyNumbers } from "@/utils";

/** Campos da etapa 1 do checkout que podem travar o avanço. */
export type CheckoutField =
  | "name"
  | "phone"
  | "cpf"
  | "zipCode"
  | "street"
  | "number"
  | "neighborhood"
  | "city"
  | "state";

export type CheckoutFieldErrors = Partial<Record<CheckoutField, string>>;

/** Campos que pertencem ao endereço, e não aos dados de contato. */
export const CHECKOUT_ADDRESS_FIELDS: readonly CheckoutField[] = [
  "zipCode",
  "street",
  "number",
  "neighborhood",
  "city",
  "state",
];

/** Nome do campo como aparece na tela, para a mensagem dizer qual falta. */
export const CHECKOUT_FIELD_LABELS: Record<CheckoutField, string> = {
  name: "Nome completo",
  phone: "Telefone",
  cpf: "CPF",
  zipCode: "CEP",
  street: "Rua",
  number: "Número",
  neighborhood: "Bairro",
  city: "Cidade",
  state: "Estado",
};

const FIELD_MESSAGES: Record<CheckoutField, string> = {
  name: "Informe seu nome completo.",
  phone: "Informe seu telefone.",
  cpf: "Informe um CPF válido.",
  zipCode: "Informe o CEP com 8 dígitos.",
  street: "Informe a rua.",
  number: "Informe o número.",
  neighborhood: "Informe o bairro.",
  city: "Informe a cidade.",
  state: "Informe o estado.",
};

type CheckoutFormValues = Record<CheckoutField, string | undefined>;

const isBlank = (value: string | undefined) => !value?.trim();

/**
 * O que falta para sair da etapa 1, campo a campo, na ordem da tela. Antes a
 * tela só sabia "válido ou não" e respondia com um toast genérico ("Preencha
 * nome, telefone e endereço"), sem dizer qual campo - quem tinha a rua
 * apagada pela busca do CEP ficava preso sem saber por quê (LDMF-350).
 *
 * As regras são as mesmas de antes: o CPF só é pedido quando a conta não tem
 * um, e o CEP tem de ter 8 dígitos. Na retirada, o endereço não entra.
 */
export function getCheckoutFieldErrors({
  values,
  orderType,
  hasCpf,
}: {
  values: CheckoutFormValues;
  orderType: "delivery" | "pickup";
  hasCpf: boolean;
}): CheckoutFieldErrors {
  const errors: CheckoutFieldErrors = {};

  if (isBlank(values.name)) errors.name = FIELD_MESSAGES.name;
  if (isBlank(values.phone)) errors.phone = FIELD_MESSAGES.phone;
  if (!hasCpf && !isValidCpf(values.cpf ?? "")) errors.cpf = FIELD_MESSAGES.cpf;

  if (orderType === "pickup") return errors;

  if (onlyNumbers(values.zipCode ?? "").length !== 8) {
    errors.zipCode = FIELD_MESSAGES.zipCode;
  }

  for (const field of CHECKOUT_ADDRESS_FIELDS) {
    if (field !== "zipCode" && isBlank(values[field])) {
      errors[field] = FIELD_MESSAGES[field];
    }
  }

  return errors;
}

/**
 * Mensagem do toast quando o cliente tenta avançar com algo faltando: diz
 * quais campos são, e não só que "falta algo".
 */
export function describeMissingFields(errors: CheckoutFieldErrors): string {
  const fields = Object.keys(errors) as CheckoutField[];

  if (fields.length === 1) return errors[fields[0]] as string;

  const labels = fields.map((field) => CHECKOUT_FIELD_LABELS[field]);
  return `Falta preencher: ${labels.join(", ")}.`;
}
