/**
 * Regras do campo de hora 24h digitado (LDMF-351).
 *
 * O campo mostra sempre "HH:MM". Os dígitos digitados substituem o modelo da
 * esquerda para a direita e o que falta é zero: "1" mostra 10:00, "12" mostra
 * 12:00, "123" mostra 12:30. O que aparece na tela é o que vai para o back.
 */

/** Até 4 dígitos (HHMM) viram "HH:MM", completando com zero à direita. */
export const timeFromTypedDigits = (typed: string): string => {
  const digits = typed.slice(0, 4).padEnd(4, "0");
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
};

/**
 * Próximo estado dos dígitos digitados, ou `null` quando o dígito não entra.
 *
 * - Hora vai de 00 a 23: primeiro dígito 3 a 9 vira "0X" (9 → 09), e depois
 *   de um 2 só entra 0 a 3.
 * - Minuto vai de 00 a 59: primeiro dígito 6 a 9 vira "0X" (7 → 07).
 * - Com os quatro dígitos preenchidos, nada mais entra.
 */
export const typeTimeDigit = (typed: string, digit: string): string | null => {
  if (!/^\d$/.test(digit) || typed.length >= 4) return null;

  const n = Number(digit);
  switch (typed.length) {
    case 0:
      return n > 2 ? `0${digit}` : digit;
    case 1:
      return typed === "2" && n > 3 ? null : typed + digit;
    case 2:
      return n > 5 ? `${typed}0${digit}` : typed + digit;
    default:
      return typed + digit;
  }
};

/** Aplica vários dígitos em sequência (colar), pulando os que não entram. */
export const typeTimeDigits = (typed: string, text: string): string => {
  let current = typed;
  for (const ch of text.replace(/\D/g, "")) {
    current = typeTimeDigit(current, ch) ?? current;
  }
  return current;
};

/** Posição do cursor depois de N dígitos, pulando o ":". */
export const timeCaretPosition = (typedLength: number): number =>
  typedLength >= 2 ? typedLength + 1 : typedLength;

/** "9:00" (formato que o back também aceita) aparece como "09:00". */
export const padTime = (value: string): string => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : value;
};
