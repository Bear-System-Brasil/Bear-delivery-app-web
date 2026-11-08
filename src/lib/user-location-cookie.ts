import { parseCoords } from "@/lib/geocode";
import type { UserLocation } from "@/types/restaurant";

/**
 * Cookie `userLocation`: o ponto que a home usa para listar as lojas que
 * entregam (a busca de lojas vai sem token, então vale também para quem está
 * logado). Todo mundo que grava ou lê o cookie passa por aqui (LDMF-260).
 */
export const USER_LOCATION_COOKIE = "userLocation";

/** Evento que o header e a home escutam para reler o cookie. */
export const LOCATION_CHANGED_EVENT = "locationChanged";

const MAX_AGE_SECONDS = 86400;

/**
 * De onde veio o ponto. Vale o último gesto do cliente: escolher ou salvar
 * um endereço grava "address"; tocar em "Usar minha localização" grava
 * "gps". Cookie antigo, de antes desta regra, vem sem origem.
 */
export type LocationSource = "address" | "gps";

export type StoredUserLocation = UserLocation & {
  /** Endereço formatado para exibir. */
  address?: string;
  label?: string;
  locality?: string;
  source?: LocationSource;
};

/** Lê o cookie; `null` quando não existe ou não tem coordenada válida. */
export function readUserLocation(): StoredUserLocation | null {
  if (typeof document === "undefined") return null;

  const row = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${USER_LOCATION_COOKIE}=`));
  if (!row) return null;

  try {
    const parsed = JSON.parse(
      decodeURIComponent(row.split("=").slice(1).join("=")),
    );
    if (typeof parsed !== "object" || parsed === null) return null;

    const coords = parseCoords(parsed.lat, parsed.lng);
    return coords ? { ...parsed, ...coords } : null;
  } catch {
    return null;
  }
}

/** Grava o cookie com a origem do ponto e avisa quem escuta. */
export function writeUserLocation(
  location: Omit<StoredUserLocation, "source">,
  source: LocationSource,
) {
  const value = encodeURIComponent(JSON.stringify({ ...location, source }));
  document.cookie = `${USER_LOCATION_COOKIE}=${value}; path=/; max-age=${MAX_AGE_SECONDS}; SameSite=Lax`;
  window.dispatchEvent(new Event(LOCATION_CHANGED_EVENT));
}

type AddressLike = {
  street?: string;
  number?: string | number;
  neighborhood?: string;
  city?: string;
  state?: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
};

/** "Rua, número, bairro, cidade, UF" de um endereço salvo. */
export function formatAddressLabel(address: AddressLike) {
  return [
    address.street,
    address.number,
    address.neighborhood,
    address.city,
    address.state,
  ]
    .filter((part) => part !== undefined && part !== null && part !== "")
    .join(", ");
}

/**
 * Endereço salvo como ponto da home, com origem "address". `null` quando o
 * endereço não tem coordenada (não inventamos uma).
 */
export function locationFromAddress(
  address: AddressLike,
): Omit<StoredUserLocation, "source"> | null {
  const coords = parseCoords(address.latitude, address.longitude);
  if (!coords) return null;

  return {
    ...coords,
    city: address.city,
    address: formatAddressLabel(address),
  };
}

/**
 * O cliente escolheu este endereço (salvou como padrão no perfil): ele passa
 * a ser o ponto da home. Sem coordenada, não mexe no cookie.
 */
export function setUserLocationFromAddress(address: AddressLike) {
  const location = locationFromAddress(address);
  if (!location) return false;

  writeUserLocation(location, "address");
  return true;
}
