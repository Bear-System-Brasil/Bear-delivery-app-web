import { BRAZIL_STATES } from "@/constants/brazil-states";
import { normalizeText, parseCoords } from "@/lib/geocode";
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
  city?: string;
  town?: string;
  village?: string;
  municipality?: string;
  state?: string;
  "ISO3166-2-lvl4"?: string;
};

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

  async function locate(
    params: Record<string, string>,
    ref: CityRef,
  ): Promise<Coords | null> {
    try {
      const result = await search(params);
      if (!result || !isInCity(result.address, ref)) return null;

      return parseCoords(result.lat, result.lon);
    } catch {
      return null;
    }
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
      return locate(
        {
          // Sem número (S/N chega vazio aqui): só a rua.
          street: [number.trim(), street.trim()].filter(Boolean).join(" "),
          city: ref.city.trim(),
          state: stateName(ref.state),
        },
        ref,
      );
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
