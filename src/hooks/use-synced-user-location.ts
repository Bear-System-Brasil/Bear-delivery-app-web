"use client";

import { useCallback, useEffect, useState } from "react";

import { useUserAddresses } from "@/hooks/use-addresses";
import { geocodeAddress } from "@/lib/geocode";
import {
  formatAddressLabel,
  locationFromAddress,
  readUserLocation,
  writeUserLocation,
  LOCATION_CHANGED_EVENT,
  type StoredUserLocation,
} from "@/lib/user-location-cookie";
import type { Address } from "@/services/api";
import type { UserLocation } from "@/types/restaurant";

async function geocodeSavedAddress(
  address: Address,
): Promise<StoredUserLocation | null> {
  const coords = await geocodeAddress(address);

  if (!coords) return null;

  return {
    ...coords,
    city: address.city,
    address: formatAddressLabel(address),
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
    const storedLocation = readUserLocation();

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
    window.addEventListener(LOCATION_CHANGED_EVENT, syncLocationFromCookie);

    return () => {
      window.removeEventListener(LOCATION_CHANGED_EVENT, syncLocationFromCookie);
    };
  }, [syncLocationFromCookie]);

  // Endereço padrão de quem está logado vira o ponto da home quando não há
  // cookie, ou quando o cookie é de antes da regra de origem (LDMF-260): um
  // GPS antigo não pode vencer o endereço que o cliente escolheu. Cookie com
  // origem ("address" ou "gps") é o último gesto do cliente e fica.
  useEffect(() => {
    if (!userAddresses.length) return;

    const stored = readUserLocation();
    if (stored?.source) return;
    if (!stored && location) return;

    let cancelled = false;

    const syncLocationFromSavedAddress = async () => {
      const preferredAddress = getPreferredAddress(userAddresses);
      if (!preferredAddress) return;

      const savedLocation =
        locationFromAddress(preferredAddress) ||
        (await geocodeSavedAddress(preferredAddress));

      if (!savedLocation || cancelled) return;

      setLocation({
        lat: savedLocation.lat,
        lng: savedLocation.lng,
        city: savedLocation.city,
      });
      writeUserLocation(savedLocation, "address");
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
