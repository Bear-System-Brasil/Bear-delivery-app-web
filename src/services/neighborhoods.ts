import casteloEs from "@/data/neighborhoods/es-castelo.json";
import { normalizeText } from "@/lib/geocode";

/**
 * Bairro da lista oficial da cidade. `lat`/`lng` ficam `null` até serem
 * levantados - sem eles o pino começa no centro da cidade.
 */
export type Neighborhood = {
  /** Nome oficial: é o único exibido. */
  name: string;
  /**
   * Outros nomes pelos quais o bairro é conhecido (ex.: o do OpenStreetMap).
   * Servem só para busca e correspondência, nunca para exibição (LDMF-278).
   */
  altNames?: string[];
  lat: number | null;
  lng: number | null;
};

/**
 * Formato combinado para a futura rota de bairros do backend (LDMF-264).
 * `ibgeCode` e `cep` podem ser `null` quando ainda não foram confirmados.
 */
export type CityNeighborhoods = {
  state: string;
  city: string;
  ibgeCode: string | null;
  cep: string | null;
  /**
   * Centro da área urbana: média das coordenadas dos bairros que têm
   * coordenada. O pino começa nele quando o bairro não tem coordenada ou o
   * cliente escolhe "Outro". Opcional: sem ele, vale a busca da cidade.
   */
  center?: { lat: number; lng: number } | null;
  neighborhoods: Neighborhood[];
};

// Lista local temporária (LDMF-260). Fonte dos nomes: Lei Municipal de Castelo
// nº 4.641, de 15/09/2026, na grafia da lei: os 32 bairros, com Pantanal e
// Jardim Primavera separados (LDMF-278). Fontes e atribuição em
// src/data/neighborhoods/README.md.
const LOCAL_LISTS: CityNeighborhoods[] = [casteloEs as CityNeighborhoods];

/**
 * Bairros de uma cidade, ou `null` quando ainda não temos lista para ela.
 *
 * Assíncrona de propósito: tem a mesma assinatura que a chamada à rota do
 * backend vai ter, então trocar a origem não muda quem usa.
 */
export async function getNeighborhoods(
  state: string,
  city: string,
): Promise<CityNeighborhoods | null> {
  const stateKey = normalizeText(state);
  const cityKey = normalizeText(city);

  if (!stateKey || !cityKey) return null;

  return (
    LOCAL_LISTS.find(
      (list) =>
        normalizeText(list.state) === stateKey &&
        normalizeText(list.city) === cityKey,
    ) ?? null
  );
}

/**
 * Bairro da lista pelo nome oficial ou por um nome alternativo, sem caixa e
 * acento. Devolve o bairro com o nome oficial, que é o que se exibe e salva.
 */
export function findNeighborhood(
  list: CityNeighborhoods | null | undefined,
  query: string | null | undefined,
): Neighborhood | null {
  const key = normalizeText(query);
  if (!list || !key) return null;

  return (
    list.neighborhoods.find((item) => normalizeText(item.name) === key) ??
    list.neighborhoods.find((item) =>
      item.altNames?.some((alt) => normalizeText(alt) === key),
    ) ??
    null
  );
}

const NUMBER_WORDS: Record<string, string> = {
  um: "1", uma: "1", dois: "2", duas: "2", tres: "3", quatro: "4",
  cinco: "5", seis: "6", sete: "7", oito: "8", nove: "9", dez: "10",
};

const ROMAN_NUMERALS: Record<string, string> = {
  i: "1", ii: "2", iii: "3", iv: "4", v: "5",
  vi: "6", vii: "7", viii: "8", ix: "9", x: "10",
};

/** Forma comparável do nome: sem caixa, acento e pontuação, números em algarismo. */
function spellingKey(name: string) {
  return normalizeText(name)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map((word) => NUMBER_WORDS[word] ?? ROMAN_NUMERALS[word] ?? word)
    .join(" ");
}

/**
 * O nome alternativo é só outra grafia do oficial ("Castelo 3", "Castelo Três"
 * e "Castelo III"; "Cava Roxa" e "Cava-Roxa")?
 */
export function isSpellingVariant(officialName: string, altName: string) {
  return spellingKey(officialName) === spellingKey(altName);
}

/**
 * Texto da opção na lista: o nome oficial e, entre parênteses, os nomes
 * alternativos que são nomes diferentes - ex.: "Castelo III (Pombal, Ivo
 * Martins)". Só exibição: o valor salvo é sempre `name`.
 */
export function neighborhoodLabel(item: Neighborhood) {
  const otherNames = (item.altNames ?? []).filter(
    (alt) => !isSpellingVariant(item.name, alt),
  );

  return otherNames.length > 0
    ? `${item.name} (${otherNames.join(", ")})`
    : item.name;
}
