import { normalizeText } from "@/lib/geocode";

/**
 * Tipo de logradouro antes do nome da rua (LDMF-282). O endereço salvo leva
 * o logradouro completo no campo `street` ("Rua Sete de Setembro"), que é o
 * que o entregador lê: o contrato do back não tem campo separado para o tipo.
 */
export const STREET_TYPES = [
  "Rua",
  "Avenida",
  "Travessa",
  "Praça",
  "Estrada",
  "Rodovia",
  "Alameda",
  "Beco",
  "Ladeira",
  "Largo",
  "Viela",
] as const;

export type StreetType = (typeof STREET_TYPES)[number];

export const DEFAULT_STREET_TYPE: StreetType = "Rua";

/** Abreviações comuns, para reconhecer endereço salvo antes do campo Tipo. */
const ABBREVIATIONS: Record<string, StreetType> = {
  r: "Rua",
  av: "Avenida",
  ave: "Avenida",
  tv: "Travessa",
  trav: "Travessa",
  pc: "Praça",
  pca: "Praça",
  est: "Estrada",
  estr: "Estrada",
  rod: "Rodovia",
  al: "Alameda",
  lad: "Ladeira",
  lgo: "Largo",
};

function typeFromWord(word: string): StreetType | null {
  const key = normalizeText(word).replace(/\.$/, "");
  if (!key) return null;

  const full = STREET_TYPES.find((type) => normalizeText(type) === key);
  if (full) return full;

  // Abreviação só com ponto ("R.", "Av."): sem o ponto, "Al" ou "R" podem
  // ser parte do nome.
  return word.endsWith(".") ? (ABBREVIATIONS[key] ?? null) : null;
}

/**
 * Separa "Rua Sete de Setembro" em tipo e nome. Sem tipo reconhecido no
 * começo, `type` é `null` e o texto inteiro é o nome.
 */
export function splitStreet(street: string | null | undefined): {
  type: StreetType | null;
  name: string;
} {
  const value = (street ?? "").trimStart();
  const match = value.match(/^(\S+)\s+([\s\S]*)$/);
  if (!match) return { type: null, name: value };

  const type = typeFromWord(match[1]);
  return type ? { type, name: match[2] } : { type: null, name: value };
}

/**
 * Logradouro completo a partir do tipo escolhido e do nome digitado. Se o
 * cliente digitou um tipo no começo do nome, vale o que ele digitou - nunca
 * sai "Rua Rua Sete de Setembro" nem "Rua Avenida Brasil". Nome vazio = rua
 * vazia. O fim não é cortado, para não comer o espaço enquanto se digita.
 */
export function joinStreet(type: StreetType, name: string): string {
  const typed = splitStreet(name);
  if (typed.type) {
    return typed.name.trim() ? `${typed.type} ${typed.name}` : "";
  }

  const clean = name.trimStart();
  return clean.trim() ? `${type} ${clean}` : "";
}

/** Mesmo logradouro, sem diferença de caixa, acento e espaço. */
export function isSameStreet(a: string | null | undefined, b: string | null | undefined) {
  const key = (value: string | null | undefined) =>
    normalizeText(value).replace(/\s+/g, " ");
  return key(a) === key(b);
}
