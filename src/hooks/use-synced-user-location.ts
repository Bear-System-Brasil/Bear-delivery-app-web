"use client";

import { useCallback, useEffect, useState } from "react";

import { useUserAddresses } from "@/hooks/use-addresses";
import { geocodeAddress, parseCoords } from "@/lib/geocode";
import type { Address } from "@/services/api";
import type { UserLocation } from "@/types/restaurant";

type StoredUserLocation = UserLocation & {
  address?: string;
};

const LOCATION_COOKIE = "userLocation";

function parseLocationCookie(): StoredUserLocation | null {
  if (typeof document === "undefined") return null;

  const locationCookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${LOCATION_COOKIE}=`));

  if (!locationCookie) return null;

  try {
    const value = locationCookie.split("=").slice(1).join("=");
    const parsed = JSON.parse(decodeURIComponent(value));

    const coords =
      typeof parsed === "object" && parsed !== null
        ? parseCoords(parsed.lat, parsed.lng)
        : null;

    if (coords) {
      return { ...parsed, ...coords };
    }
  } catch {
    return null;
  }

  return null;
}

function saveLocationCookie(location: StoredUserLocation) {
  document.cookie = `${LOCATION_COOKIE}=${encodeURIComponent(
    JSON.stringify(location),
  )}; path=/; max-age=86400; SameSite=Lax`;
  window.dispatchEvent(new Event("locationChanged"));
}

function getAddressLabel(address: Address) {
  return [
    address.street,
    address.number,
    address.neighborhood,
    address.city,
    address.state,
  ]
    .filter(Boolean)
    .join(", ");
}

function getCoordsFromAddress(address: Address): StoredUserLocation | null {
  const coords = parseCoords(address.latitude, address.longitude);

  if (!coords) return null;

  return {
    ...coords,
    city: address.city,
    address: getAddressLabel(address),
  };
}

async function geocodeSavedAddress(
  address: Address,
): Promise<StoredUserLocation | null> {
  const coords = await geocodeAddress(address);

  if (!coords) return null;

  return {
    ...coords,
    city: address.city,
    address: getAddressLabel(address),
  };
}

function getPreferredAddress(addresses: Address[]) {
  return addresses.find((address) => address.isDefault) || addresses[0];
}

export function useSyncedUserLocation(initialLocation?: UserLocation | null) {
  const { data: userAddresses = [] } = useUserAddresses();
  const [location, setLocation] = useState<UserLocation | undefined>(
    () => initialLocation ?? undefined,
  );

  const syncLocationFromCookie = useCallback(() => {
    const storedLocation = parseLocationCookie();

    if (!storedLocation) return;

    setLocation((currentLocation) => {
      if (
        currentLocation?.lat === storedLocation.lat &&
        currentLocation?.lng === storedLocation.lng &&
        currentLocation?.city === storedLocation.city
      ) {
        return currentLocation;
      }

      return {
        lat: storedLocation.lat,
        lng: storedLocation.lng,
        city: storedLocation.city,
      };
    });
  }, []);

  useEffect(() => {
    syncLocationFromCookie();
    window.addEventListener("locationChanged", syncLocationFromCookie);

    return () => {
      window.removeEventListener("locationChanged", syncLocationFromCookie);
    };
  }, [syncLocationFromCookie]);

  useEffect(() => {
    if (location || parseLocationCookie() || !userAddresses.length) return;

    let cancelled = false;

    const syncLocationFromSavedAddress = async () => {
      const preferredAddress = getPreferredAddress(userAddresses);
      if (!preferredAddress) return;

      const savedLocation =
        getCoordsFromAddress(preferredAddress) ||
        (await geocodeSavedAddress(preferredAddress));

      if (!savedLocation || cancelled) return;

      setLocation({
        lat: savedLocation.lat,
        lng: savedLocation.lng,
        city: savedLocation.city,
      });
      saveLocationCookie(savedLocation);
    };

    syncLocationFromSavedAddress();

    return () => {
      cancelled = true;
    };
  }, [location, userAddresses]);

  return {
    location,
    setLocation,
  };
}
