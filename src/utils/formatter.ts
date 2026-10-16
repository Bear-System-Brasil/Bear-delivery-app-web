import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import utc from "dayjs/plugin/utc";
import { formatCurrency as formatCurrencySafe } from "./format-currency";

dayjs.extend(utc);
dayjs.extend(customParseFormat);

/**
 * Converte qualquer formato comum de data (DD/MM/YYYY, YYYY-MM-DD ou ISO)
 * para um objeto Dayjs UTC válido, ou null se inválido/vazio.
 */
export const parseDateValue = (dateStr?: string | null) => {
  if (!dateStr || typeof dateStr !== "string") return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  let d = null;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    d = dayjs.utc(trimmed, "DD/MM/YYYY", true);
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    d = dayjs.utc(trimmed, "YYYY-MM-DD", true);
  } else {
    d = dayjs.utc(trimmed);
  }
  return d && d.isValid() ? d : null;
};

/**
 * Formata para o valor aceito por `<input type="date">` (YYYY-MM-DD).
 */
export const toDateInputFormat = (dateStr?: string | null) => {
  const d = parseDateValue(dateStr);
  return d ? d.format("YYYY-MM-DD") : "";
};

/**
 * Formata data de nascimento para envio ao backend (sempre DD/MM/YYYY).
 * Retorna undefined se vazio ou inválido, para que seja omitido do payload.
 */
export const toDateBackendFormat = (
  dateStr?: string | null,
): string | undefined => {
  const d = parseDateValue(dateStr);
  return d ? d.format("DD/MM/YYYY") : undefined;
};

export const MIN_BIRTH_AGE = 18;
export const MAX_BIRTH_AGE = 120;

export const BIRTH_DATE_MESSAGES = {
  incomplete: "Informe a data completa (dd/mm/aaaa).",
  invalid: "Data de nascimento inválida.",
  future: "A data de nascimento não pode ser no futuro.",
  underage: "É necessário ter pelo menos 18 anos.",
} as const;

/** Data (AAAA-MM-DD) do instante `now` no horário de Brasília. */
const brasiliaDate = (now: Date): string =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

/** Ano corrente no horário de Brasília. */
export const brasiliaYear = (now: Date = new Date()): number =>
  Number(brasiliaDate(now).slice(0, 4));

export const isLeapYear = (year: number): boolean =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/**
 * Dias do mês (1-12). Sem o ano, fevereiro conta 29: o ano ainda pode ser
 * bissexto, e o 29/02 de ano comum vira aviso quando o ano fecha.
 */
export const daysInMonth = (month: number, year?: number | null): number => {
  if (month === 2) return year == null || isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
};

const onlyDigits = (value: string) => value.replace(/\D/g, "").slice(0, 8);

/**
 * O dígito na posição `i` (0-7 de ddmmaaaa) é possível, dados os anteriores?
 * Dia 01-31, mês 01-12 compatível com o dia já digitado, ano começando em 1 ou 2.
 */
const isBirthDateDigitAllowed = (d: number[], i: number): boolean => {
  const x = d[i];
  switch (i) {
    case 0:
      return x <= 3;
    case 1:
      if (d[0] === 0) return x >= 1;
      if (d[0] === 3) return x <= 1;
      return true;
    case 2:
      return x <= 1;
    case 3: {
      if (d[2] === 0 && x === 0) return false;
      if (d[2] === 1 && x > 2) return false;
      const day = d[0] * 10 + d[1];
      return day <= daysInMonth(d[2] * 10 + x);
    }
    case 4:
      return x === 1 || x === 2;
    default:
      return true;
  }
};

/** Quantos dígitos impossíveis há em ddmmaaaa (0 = todos possíveis até aqui). */
export const countImpossibleBirthDateDigits = (value: string): number => {
  const d = onlyDigits(value).split("").map(Number);
  return d.filter((_, i) => !isBirthDateDigitAllowed(d, i)).length;
};

/**
 * Regra única da data de nascimento, usada no cadastro e no perfil (LDMF-301/303).
 * Retorna a mensagem de erro, ou null se a data é aceita: completa, existente,
 * não futura, com 18 anos ou mais e no máximo 120 anos (mesmos limites do back,
 * contrato do LDMF-302 de 16/10).
 *
 * Data incompleta que já tem dígito impossível (ex.: colada) é "inválida", não
 * "incompleta", para o aviso aparecer na hora.
 *
 * É autodeclaração (triagem), não verificação de idade. O "hoje" é o dia no
 * horário de Brasília, como no back: quem faz 18 anos hoje já é aceito, a
 * qualquer hora e em qualquer fuso do aparelho.
 */
export const getBirthDateError = (
  birthDateStr?: string | null,
  now: Date = new Date(),
): string | null => {
  if (!isCompleteDateFormat(birthDateStr)) {
    return countImpossibleBirthDateDigits(birthDateStr ?? "") > 0
      ? BIRTH_DATE_MESSAGES.invalid
      : BIRTH_DATE_MESSAGES.incomplete;
  }
  const birth = parseDateValue(birthDateStr);
  if (!birth) return BIRTH_DATE_MESSAGES.invalid;

  const today = dayjs.utc(brasiliaDate(now), "YYYY-MM-DD");
  if (birth.isAfter(today)) return BIRTH_DATE_MESSAGES.future;
  const age = today.diff(birth, "year");
  if (age > MAX_BIRTH_AGE) return BIRTH_DATE_MESSAGES.invalid;
  if (age < MIN_BIRTH_AGE) return BIRTH_DATE_MESSAGES.underage;
  return null;
};

/**
 * Máscara dd/mm/aaaa aplicada enquanto a pessoa digita: as barras entram
 * sozinhas a partir do 3º e do 5º dígito. Aceita no máximo 8 dígitos.
 */
export const maskBirthDate = (value: string): string => {
  const digits = onlyDigits(value);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

/**
 * Próximo valor do campo de data (LDMF-303). Digitação que cria dígito
 * impossível é recusada: o dígito nem entra e o campo fica como estava.
 * Apagar sempre passa. Entrada de vários dígitos de uma vez (colar,
 * preenchimento automático) aproveita só os números e entra mesmo que não
 * feche: aí o aviso aparece (getBirthDateError), sem travar o campo.
 */
export const nextBirthDateValue = (previous: string, next: string): string => {
  const before = onlyDigits(previous);
  const after = onlyDigits(next);
  const isDeletion = after.length < before.length;
  const isBulkInsert = after.length - before.length > 1;
  if (isDeletion || isBulkInsert) return maskBirthDate(after);

  const addsImpossible =
    countImpossibleBirthDateDigits(after) > countImpossibleBirthDateDigits(before);
  return maskBirthDate(addsImpossible ? before : after);
};

/** Partes já completas do campo (dia, mês, ano), para o seletor. */
export const birthDateParts = (
  value: string,
): { day: number | null; month: number | null; year: number | null } => {
  const d = onlyDigits(value);
  const day = d.length >= 2 ? Number(d.slice(0, 2)) : null;
  const month = d.length >= 4 ? Number(d.slice(2, 4)) : null;
  const year = d.length === 8 ? Number(d.slice(4, 8)) : null;
  return {
    day: day && day <= 31 ? day : null,
    month: month && month <= 12 ? month : null,
    year,
  };
};

/** Anos do seletor: de 18 a 120 anos atrás, do mais recente ao mais antigo. */
export const birthDatePickerYears = (now: Date = new Date()): number[] => {
  const current = brasiliaYear(now);
  return Array.from(
    { length: MAX_BIRTH_AGE - MIN_BIRTH_AGE + 1 },
    (_, i) => current - MIN_BIRTH_AGE - i,
  );
};

/**
 * Confere se a data de nascimento está em formato completo (DD/MM/AAAA ou AAAA-MM-DD).
 */
export const isCompleteDateFormat = (dateStr?: string | null): boolean => {
  if (!dateStr || typeof dateStr !== "string") return false;
  const trimmed = dateStr.trim();
  return (
    /^\d{2}\/\d{2}\/\d{4}$/.test(trimmed) || /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
  );
};

/**
 * Remove todos os caracteres não numéricos de um CPF
 * @param cpf - CPF com ou sem formatação
 * @returns CPF apenas com números
 */
export const formatCPF = (cpf: string): string => {
  return cpf.replace(/\D/g, "");
};

/**
 * Formata um CPF aplicando a máscara 000.000.000-00 progressivamente conforme digitação
 * @param value - CPF com ou sem formatação
 * @returns CPF formatado com máscara
 */
export const formatCpfDisplay = (value: string): string => {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9)
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
};

/**
 * Remove prefixo +55 e caracteres não numéricos de um telefone
 * @param phone - Telefone com ou sem formatação
 * @returns Telefone apenas com números, sem código do país
 */
export const formatPhone = (phone: string): string => {
  const cleanPhone = phone.replace(/\D/g, "");
  if (cleanPhone.startsWith("55") && cleanPhone.length === 13) {
    return cleanPhone.substring(2);
  }
  return cleanPhone;
};

/**
 * Formata um CNPJ aplicando a máscara 00.000.000/0000-00
 * @param value - CNPJ com ou sem formatação
 * @returns CNPJ formatado com máscara
 */
export const formatCnpj = (value: string): string => {
  return value
    .replace(/\D/g, "")
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2")
    .substring(0, 18);
};

/**
 * Formata um telefone aplicando a máscara (00) 00000-0000
 * @param value - Telefone com ou sem formatação
 * @returns Telefone formatado com máscara
 */
export const formatPhoneDisplay = (value: string): string => {
  return value
    .replace(/\D/g, "")
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2")
    .substring(0, 15);
};

/**
 * Formata um CEP aplicando a máscara 00000-000
 * @param value - CEP com ou sem formatação
 * @returns CEP formatado com máscara
 */
export const formatCep = (value: string): string => {
  return value
    .replace(/\D/g, "")
    .replace(/(\d{5})(\d)/, "$1-$2")
    .substring(0, 9);
};

/**
 * Remove todos os caracteres não numéricos
 * @param value - String com caracteres diversos
 * @returns String apenas com números
 */
export const onlyNumbers = (value: string): string => {
  return value.replace(/\D/g, "");
};

/**
 * Formata um valor monetário para exibição
 * @param value - Valor numérico
 * @returns String formatada como moeda brasileira (R$ 0,00)
 *
 * Reexporta `format-currency.ts` - havia duas implementações com o mesmo
 * nome e comportamento diferente pra `undefined`/`NaN` (essa aqui produzia
 * "R$ NaN"), e qual delas um componente pegava dependia só do caminho de
 * import (`@/utils` vs `@/utils/format-currency`), não do dado em si.
 */
export const formatCurrency = (value: number): string => formatCurrencySafe(value);

/**
 * Formata uma data para exibição em português
 * @param date - Data como string ou Date
 * @param format - Formato desejado (padrão: 'DD/MM/YYYY')
 * @returns Data formatada
 */
export const formatDate = (
  date: string | Date,
  format: string = "DD/MM/YYYY",
): string => {
  if (!date) return "";
  if (typeof date === "string") {
    const parsed = parseDateValue(date);
    return parsed ? parsed.format(format) : "";
  }
  const d = dayjs(date);
  return d.isValid() ? d.format(format) : "";
};

/**
 * Valida se um CPF é válido (apenas estrutura, não dígitos verificadores)
 * @param cpf - CPF para validar
 * @returns true se tem 11 dígitos
 */
export const isValidCpf = (cpf: string): boolean => {
  const cleaned = formatCPF(cpf);
  return cleaned.length === 11;
};

/**
 * Valida se um CNPJ é válido (apenas estrutura, não dígitos verificadores)
 * @param cnpj - CNPJ para validar
 * @returns true se tem 14 dígitos
 */
export const isValidCnpj = (cnpj: string): boolean => {
  const cleaned = onlyNumbers(cnpj);
  return cleaned.length === 14;
};

/**
 * Valida se um telefone celular é válido
 * @param phone - Telefone para validar
 * @returns true se tem 11 dígitos (DDD + 9 dígitos)
 */
export const isValidPhone = (phone: string): boolean => {
  const cleaned = formatPhone(phone);
  return cleaned.length === 11;
};

/**
 * Valida se um CEP é válido
 * @param cep - CEP para validar
 * @returns true se tem 8 dígitos
 */
export const isValidCep = (cep: string): boolean => {
  const cleaned = onlyNumbers(cep);
  return cleaned.length === 8;
};

export function formatPhoneRegex(phone: string) {
  return phone.replace(/^(\d{2})(\d{1})(\d{4})(\d{4})$/, "($1) $2 $3-$4");
}

/**
 * Nome do cliente para exibição. O backend embute a relação `customer` nas
 * listas de pedidos e pagamentos (ver order.md / payment.md); o UUID é chave
 * de API e não deve virar rótulo de tela, então quando a relação não vem o
 * fallback é genérico.
 * @param customer - Relação `customer` do pedido/pagamento, quando presente
 * @returns Nome do cliente ou "Cliente" como fallback
 */
export const getCustomerDisplayName = (
  customer?: { name?: string | null } | null,
): string => customer?.name?.trim() || "Cliente";
