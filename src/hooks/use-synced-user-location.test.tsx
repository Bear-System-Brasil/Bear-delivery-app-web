import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Address } from "@/services/api";

/**
 * Qual ponto a home usa (LDMF-260): vale o último gesto do cliente. Cookie
 * antigo, sem origem (um GPS de antes da regra), perde para o endereço
 * padrão de quem está logado.
 */

let addresses: Address[] = [];
vi.mock("@/hooks/use-addresses", () => ({
  useUserAddresses: () => ({ data: addresses }),
}));

const geocodeAddress = vi.fn();
vi.mock("@/lib/geocode", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/geocode")>()),
  geocodeAddress: (...args: unknown[]) => geocodeAddress(...args),
}));

const { useSyncedUserLocation } = await import("./use-synced-user-location");
const { readUserLocation, writeUserLocation } = await import(
  "@/lib/user-location-cookie"
);

const ALEGRE_DEFAULT = {
  id: "a1",
  street: "Rua A",
  number: "10",
  neighborhood: "Centro",
  city: "Alegre",
  state: "ES",
  zipCode: "29500000",
  isDefault: true,
  latitude: -20.76,
  longitude: -41.53,
} as Address;

const CASTELO_GPS = { lat: -20.6033, lng: -41.1847, city: "Castelo" };

function setLegacyCookie(value: object) {
  document.cookie = `userLocation=${encodeURIComponent(JSON.stringify(value))}; path=/`;
}

describe("useSyncedUserLocation", () => {
  beforeEach(() => {
    addresses = [];
    geocodeAddress.mockReset();
  });

  afterEach(() => {
    document.cookie = "userLocation=; path=/; max-age=0";
  });

  it("cookie antigo de GPS perde para o endereço padrão de quem está logado", async () => {
    setLegacyCookie(CASTELO_GPS);
    addresses = [ALEGRE_DEFAULT];

    const { result } = renderHook(() => useSyncedUserLocation(CASTELO_GPS));

    await waitFor(() =>
      expect(result.current.location).toEqual({
        lat: -20.76,
        lng: -41.53,
        city: "Alegre",
      }),
    );
    expect(readUserLocation()?.source).toBe("address");
  });

  it("GPS tocado pelo cliente (origem gps) fica, mesmo com endereço padrão", async () => {
    writeUserLocation(CASTELO_GPS, "gps");
    addresses = [ALEGRE_DEFAULT];

    const { result } = renderHook(() => useSyncedUserLocation(CASTELO_GPS));

    await waitFor(() => expect(result.current.location?.city).toBe("Castelo"));
    expect(readUserLocation()).toMatchObject({ city: "Castelo", source: "gps" });
  });

  it("sem cookie, usa o endereço padrão", async () => {
    addresses = [ALEGRE_DEFAULT];

    const { result } = renderHook(() => useSyncedUserLocation(null));

    await waitFor(() => expect(result.current.location?.city).toBe("Alegre"));
    expect(readUserLocation()?.source).toBe("address");
  });

  it("sem login (sem endereços), o cookie antigo continua valendo", async () => {
    setLegacyCookie(CASTELO_GPS);

    const { result } = renderHook(() => useSyncedUserLocation(CASTELO_GPS));

    await waitFor(() => expect(result.current.location?.city).toBe("Castelo"));
    expect(readUserLocation()?.source).toBeUndefined();
  });

  it("escolher um endereço depois do GPS troca o ponto", async () => {
    writeUserLocation(CASTELO_GPS, "gps");
    const { result } = renderHook(() => useSyncedUserLocation(CASTELO_GPS));

    writeUserLocation({ lat: -20.76, lng: -41.53, city: "Alegre" }, "address");

    await waitFor(() => expect(result.current.location?.city).toBe("Alegre"));
  });
});
