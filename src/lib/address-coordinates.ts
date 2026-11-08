import {
  geocodeAddress,
  parseCoords,
  type GeocodableAddress,
} from "@/lib/geocode";
import { Coords } from "@/types/restaurant";

/**
 * De onde veio a coordenada que está no formulário de endereço.
 *
 * - `cep`: a coordenada que a BrasilAPI devolve junto com o CEP. É do
 *   logradouro inteiro, não do número, então serve só como ponto de partida.
 * - `geocode`: geocodificação do endereço digitado (Nominatim), que leva o
 *   número em conta - é o mesmo caminho que o cadastro da loja já usa.
 * - `stored`: a coordenada que já estava salva naquele endereço. Vale
 *   enquanto o cliente não mexer no endereço; se o texto mudar, ela deixa de
 *   valer e quem limpa é o formulário (ver `hasAddressTextChanged`).
 * - `manual`: o cliente apontou - clique no mapa ou botão "Usar localização".
 * - `neighborhood`: centro do bairro escolhido na lista (ou da cidade, quando
 *   o bairro não tem coordenada).
 *
 * Ordem de prioridade (clique no mapa > geocodificação > CEP): uma fonte
 * nunca é sobrescrita por outra de prioridade menor.
 */
export type CoordinateSource =
  | "cep"
  | "geocode"
  | "neighborhood"
  | "stored"
  | "manual";

const SOURCE_RANK: Record<CoordinateSource, number> = {
  cep: 1,
  geocode: 2,
  neighborhood: 2,
  stored: 3,
  manual: 3,
};

/**
 * Fontes que são palavra final: já representam o endereço certo, então não
 * tentamos geocodificar por cima na hora de salvar.
 */
const FINAL_SOURCES: readonly CoordinateSource[] = ["stored", "manual"];

export type SourcedCoords = {
  coords: Coords;
  source: CoordinateSource;
};

/**
 * Uma coordenada nova só entra se a fonte dela for pelo menos tão confiável
 * quanto a que já está lá. Empate passa: dois cliques no mapa, vale o
 * segundo; GPS depois de clique no mapa, vale o GPS.
 */
export function shouldReplaceCoords(
  current: SourcedCoords | null,
  nextSource: CoordinateSource,
): boolean {
  if (!current) return true;

  return SOURCE_RANK[nextSource] >= SOURCE_RANK[current.source];
}

/** Aplica `next` em cima de `current` respeitando a prioridade das fontes. */
export function withCoords(
  current: SourcedCoords | null,
  coords: Coords | null,
  source: CoordinateSource,
): SourcedCoords | null {
  if (!coords) return current;
  if (!shouldReplaceCoords(current, source)) return current;

  return { coords, source };
}

/**
 * Campos que identificam o endereço no mapa. Complemento e referência ficam
 * de fora de propósito: mudar "apto 32" para "apto 41" não move o ponto.
 */
const ADDRESS_TEXT_FIELDS = [
  "zipCode",
  "street",
  "number",
  "neighborhood",
  "city",
  "state",
] as const;

/** Chave estável do endereço digitado, para detectar que ele mudou. */
export function addressTextKey(address: GeocodableAddress): string {
  return ADDRESS_TEXT_FIELDS.map((field) =>
    (address[field] ?? "").toString().trim().toLowerCase(),
  ).join("|");
}

/**
 * Coordenada que a BrasilAPI devolve junto com o CEP (v2), em
 * `location.coordinates.{latitude,longitude}` e como string.
 *
 * Nem todo CEP tem: nesses casos a API responde `coordinates: {}`, e
 * `parseCoords` já trata ausente/vazio/0,0 como "sem coordenada".
 */
export function parseBrasilApiCoords(payload: unknown): Coords | null {
  const location = (
    payload as {
      location?: {
        coordinates?: { latitude?: unknown; longitude?: unknown };
      };
    } | null
  )?.location;

  return parseCoords(
    location?.coordinates?.latitude,
    location?.coordinates?.longitude,
  );
}

/**
 * Resolve a coordenada definitiva na hora de salvar o endereço.
 *
 * Gesto explícito do cliente (clique no mapa, "Usar localização") e
 * coordenada já salva de um endereço que ele não alterou passam direto. Fora
 * isso geocodificamos o endereço digitado, que é mais preciso que a
 * coordenada do CEP porque considera o número - é o que
 * `use-company-profile-management` já faz com o endereço da loja, e sem isso
 * o endereço do cliente ia para o banco sem coordenada nenhuma.
 *
 * Se a geocodificação falhar, a coordenada que já estava (a do CEP) continua
 * valendo: nunca devolvemos menos do que entrou.
 */
export async function resolveAddressCoordinates(
  address: GeocodableAddress,
  current: SourcedCoords | null,
): Promise<SourcedCoords | null> {
  if (current && FINAL_SOURCES.includes(current.source)) return current;

  const geocoded = await geocodeAddress(address);

  if (geocoded) return { coords: geocoded, source: "geocode" };

  return current;
}
