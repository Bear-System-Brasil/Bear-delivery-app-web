import { BRAZIL_STATES } from "@/constants/brazil-states";
import { normalizeText, parseCoords } from "@/lib/geocode";
import { splitStreet } from "@/lib/street-type";
import { Coords } from "@/types/restaurant";

/**
 * Cliente do Nominatim (OpenStreetMap) para posicionar o pino do endereço.
 *
 * Regras de uso do servidor público (levantadas na LDMF-259):
 * - no máximo 1 requisição por segundo: as chamadas entram numa fila;
 * - cache por busca: o mesmo endereço não é pedido duas vezes;
 * - parâmetros sempre codificados (`URLSearchParams`), nunca concatenados.
 *
 * O resultado só vale se cair dentro da cidade escolhida pelo cliente - em
 * cidade pequena o Nominatim erra bastante e devolve ponto em outro município.
 */

const SEARCH_URL = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL_MS = 1000;


export type CityRef = {
  city: string;
  /** UF, ex.: "ES". */
  state: string;
};

export type NominatimAddress = {
  /** Nome da via, com o tipo ("Avenida Nossa Senhora da Penha"). */
  road?: string;
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  "ISO3166-2-lvl4"?: string;
};

/** Rua achada pelas tentativas de `findStreet` (LDMF-282). */
export type StreetMatch = {
  coords: Coords;
  /** Nome da via no OpenStreetMap, quando veio. */
  road: string | null;
  /**
   * Achou só sem o tipo escolhido (ou o endereço não tinha tipo): o nome da
   * via pode ser outro ("Avenida", não "Rua") e o cliente precisa confirmar.
   */
  withoutChosenType: boolean;
};

/** Máximo de chamadas por busca de rua (todas passam pela fila). */
export const MAX_STREET_ATTEMPTS = 4;

type NominatimResult = {
  lat: string;
  lon: string;
  address?: NominatimAddress;
};

// O formulário guarda a UF; a busca estruturada do Nominatim entende melhor o
// nome do estado.
function stateName(uf: string) {
  return BRAZIL_STATES[uf.trim().toUpperCase()] ?? uf;
}

/**
 * O ponto devolvido é da cidade escolhida? Compara o nome exato do município
 * (sem caixa e acento) e o estado - "Castelo" não pode casar com
 * "Conceição do Castelo".
 */
export function isInCity(
  address: NominatimAddress | undefined,
  { city, state }: CityRef,
): boolean {
  if (!address) return false;

  const cityKey = normalizeText(city);
  const names = [
    address.city,
    address.town,
    address.village,
    address.municipality,
  ].map((name) => normalizeText(name));

  if (!cityKey || !names.includes(cityKey)) return false;

  const iso = address["ISO3166-2-lvl4"];
  if (iso) return iso.toUpperCase() === `BR-${state.trim().toUpperCase()}`;

  return normalizeText(address.state) === normalizeText(stateName(state));
}

type ClientOptions = {
  fetchFn?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export function createNominatimClient({
  fetchFn = (...args) => fetch(...args),
  now = () => Date.now(),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: ClientOptions = {}) {
  const cache = new Map<string, Promise<NominatimResult | null>>();
  let queue: Promise<unknown> = Promise.resolve();
  let lastRequestAt = Number.NEGATIVE_INFINITY;

  function throttled<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      const wait = lastRequestAt + MIN_INTERVAL_MS - now();
      if (wait > 0) await sleep(wait);
      lastRequestAt = now();
      return task();
    });

    queue = run.catch(() => undefined);
    return run;
  }

  function search(params: Record<string, string>) {
    const key = new URLSearchParams({
      ...params,
      country: "Brasil",
      countrycodes: "br",
      format: "jsonv2",
      addressdetails: "1",
      limit: "1",
    }).toString();

    const cached = cache.get(key);
    if (cached) return cached;

    const request = throttled(async () => {
      const response = await fetchFn(`${SEARCH_URL}?${key}`);
      if (!response.ok) throw new Error(`Nominatim respondeu ${response.status}`);

      const results: unknown = await response.json();
      return Array.isArray(results) && results[0]
        ? (results[0] as NominatimResult)
        : null;
    });

    cache.set(key, request);
    // Falha de rede não fica no cache: a próxima tentativa busca de novo.
    request.catch(() => cache.delete(key));

    return request;
  }

  async function locateResult(
    params: Record<string, string>,
    ref: CityRef,
  ): Promise<{ coords: Coords; road: string | null } | null> {
    try {
      const result = await search(params);
      if (!result || !isInCity(result.address, ref)) return null;

      const coords = parseCoords(result.lat, result.lon);
      if (!coords) return null;

      const road = result.address?.road?.trim();
      return { coords, road: road || null };
    } catch {
      return null;
    }
  }

  async function locate(
    params: Record<string, string>,
    ref: CityRef,
  ): Promise<Coords | null> {
    return (await locateResult(params, ref))?.coords ?? null;
  }

  /** Busca estruturada de rua e número, sem o bairro. */
  function streetParams(street: string, number: string, ref: CityRef) {
    return {
      // Sem número (S/N chega vazio aqui): só a rua.
      street: [number.trim(), street.trim()].filter(Boolean).join(" "),
      city: ref.city.trim(),
      state: stateName(ref.state),
    };
  }

  return {
    /**
     * Rua e número dentro da cidade. Busca estruturada sem o bairro: em
     * cidade pequena o Nominatim não conhece o bairro e acaba casando o nome
     * dele com outro lugar.
     */
    searchAddress({
      street,
      number,
      ...ref
    }: CityRef & { street: string; number: string }) {
      return locate(streetParams(street, number, ref), ref);
    },

    /**
     * Rua dentro da cidade, com tentativas (LDMF-282), parando na primeira
     * que cair na cidade:
     *
     * 1. logradouro completo + número;
     * 2. logradouro completo, sem número (o OSM quase não tem número);
     * 3. só o nome, sem o tipo, + número;
     * 4. só o nome, sem o tipo e sem número.
     *
     * As 3 e 4 cobrem o tipo errado ("Rua" numa avenida): medido em Castelo,
     * "Rua Nossa Senhora da Penha" não acha nada e "Nossa Senhora da Penha"
     * acha a Avenida. O nome da via que voltou vai para o cliente confirmar.
     * `isCancelled` para as tentativas de uma busca que ficou velha.
     */
    async findStreet(
      { street, number, ...ref }: CityRef & { street: string; number: string },
      isCancelled: () => boolean = () => false,
    ): Promise<StreetMatch | null> {
      const { type, name } = splitStreet(street);
      const fullStreet = street.trim();
      const bareName = name.trim();
      const numbers = number.trim() ? [number, ""] : [""];

      const attempts: { street: string; number: string; withoutType: boolean }[] =
        [];
      for (const value of numbers) {
        attempts.push({ street: fullStreet, number: value, withoutType: !type });
      }
      if (type && bareName) {
        for (const value of numbers) {
          attempts.push({ street: bareName, number: value, withoutType: true });
        }
      }

      for (const attempt of attempts.slice(0, MAX_STREET_ATTEMPTS)) {
        if (isCancelled()) return null;

        const found = await locateResult(
          streetParams(attempt.street, attempt.number, ref),
          ref,
        );
        if (found) return { ...found, withoutChosenType: attempt.withoutType };
      }

      return null;
    },

    /** Centro da cidade, para quando o bairro não tem coordenada. */
    searchCity(ref: CityRef) {
      return locate(
        { city: ref.city.trim(), state: stateName(ref.state) },
        ref,
      );
    },

    /** Limpa cache e fila - para testes. */
    reset() {
      cache.clear();
      queue = Promise.resolve();
      lastRequestAt = Number.NEGATIVE_INFINITY;
    },
  };
}

export const nominatim = createNominatimClient();
