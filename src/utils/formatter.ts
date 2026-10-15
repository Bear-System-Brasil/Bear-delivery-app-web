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

/**
 * Verifica se a data de nascimento informada corresponde a uma pessoa maior de idade (18+ anos).
 * Utiliza autodeclaração como triagem inicial de maioridade (LDMF-301).
 */
export const isAdult = (
  birthDateStr?: string | null,
  minAge: number = 18,
): boolean => {
  const d = parseDateValue(birthDateStr);
  if (!d || !d.isValid()) return false;
  const today = dayjs.utc();
  const age = today.diff(d, "year");
  return age >= minAge && age <= 125;
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
