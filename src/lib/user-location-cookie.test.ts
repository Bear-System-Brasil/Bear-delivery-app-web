import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LOCATION_CHANGED_EVENT,
  locationFromAddress,
  readUserLocation,
  setUserLocationFromAddress,
  writeUserLocation,
} from "./user-location-cookie";

/** Cookie `userLocation` com a origem do ponto (LDMF-260). */

function clearCookie() {
  document.cookie = "userLocation=; path=/; max-age=0";
}

describe("user-location-cookie", () => {
  afterEach(() => {
    clearCookie();
    vi.restoreAllMocks();
  });

  it("grava com a origem, avisa quem escuta e lê de volta", () => {
    const listener = vi.fn();
    window.addEventListener(LOCATION_CHANGED_EVENT, listener);

    writeUserLocation({ lat: -20.6, lng: -41.2, city: "Castelo" }, "gps");

    expect(listener).toHaveBeenCalledTimes(1);
    expect(readUserLocation()).toMatchObject({
      lat: -20.6,
      lng: -41.2,
      city: "Castelo",
      source: "gps",
    });
    window.removeEventListener(LOCATION_CHANGED_EVENT, listener);
  });

  it("cookie antigo, sem origem, continua sendo lido", () => {
    document.cookie = `userLocation=${encodeURIComponent(
      JSON.stringify({ lat: "-20.6", lng: "-41.2", city: "Castelo" }),
    )}; path=/`;

    const stored = readUserLocation();
    expect(stored).toMatchObject({ lat: -20.6, lng: -41.2, city: "Castelo" });
    expect(stored?.source).toBeUndefined();
  });

  it("sem coordenada válida não há localização", () => {
    document.cookie = `userLocation=${encodeURIComponent(
      JSON.stringify({ city: "Castelo" }),
    )}; path=/`;
    expect(readUserLocation()).toBeNull();
  });

  it("endereço sem coordenada não vira localização nem mexe no cookie", () => {
    writeUserLocation({ lat: -20.6, lng: -41.2, city: "Castelo" }, "gps");

    expect(locationFromAddress({ city: "Alegre" })).toBeNull();
    expect(setUserLocationFromAddress({ city: "Alegre" })).toBe(false);
    expect(readUserLocation()?.source).toBe("gps");
  });

  it("endereço com coordenada vira o ponto com origem address", () => {
    expect(
      setUserLocationFromAddress({
        street: "Rua A",
        number: "10",
        neighborhood: "Centro",
        city: "Alegre",
        state: "ES",
        latitude: -20.76,
        longitude: -41.53,
      }),
    ).toBe(true);

    expect(readUserLocation()).toMatchObject({
      lat: -20.76,
      lng: -41.53,
      city: "Alegre",
      address: "Rua A, 10, Centro, Alegre, ES",
      source: "address",
    });
  });
});
