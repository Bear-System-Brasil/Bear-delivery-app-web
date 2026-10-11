import { DEFAULT_DELIVERY_FEE } from "@/constants/delivery-defaults";
import { Coords } from "@/types/restaurant";

/**
 * Regra de cálculo do frete aplicada pelo backend em `POST /order/:id`:
 * - Até 3 km de distância Haversine entre o endereço ativo da loja e o
 *   endereço de entrega do cliente: taxa fixa mínima de R$ 5,00.
 * - Acima de 3 km: R$ 5,00 + R$ 2,00 por km excedente, arredondado em
 *   2 casas decimais.
 */
export const BASE_SHIPPING_FEE = 5;
export const BASE_SHIPPING_DISTANCE_KM = 3;
export const EXTRA_KM_SHIPPING_FEE = 2;
const EARTH_RADIUS_KM = 6371;

export type RestaurantShippingSource = {
  deliveryFee?: string | number | null;
  Address?: Array<{
    latitude?: unknown;
    longitude?: unknown;
    isActive?: boolean;
  }> | null;
};

export function parseShippingCoords(
  lat: unknown,
  lng: unknown,
): Coords | null {
  if (lat === null || lat === undefined || lat === "") return null;
  if (lng === null || lng === undefined || lng === "") return null;

  const parsedLat = Number(lat);
  const parsedLng = Number(lng);

  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) return null;
  if (parsedLat === 0 && parsedLng === 0) return null;

  return { lat: parsedLat, lng: parsedLng };
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function calculateHaversineDistanceKm(
  origin: Coords,
  destination: Coords,
): number {
  const dLat = toRadians(destination.lat - origin.lat);
  const dLng = toRadians(destination.lng - origin.lng);
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(destination.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

export function calculateShippingFeeFromCoords(
  storeCoords: Coords,
  customerCoords: Coords,
): number {
  const distanceKm = calculateHaversineDistanceKm(storeCoords, customerCoords);
  const extraKm = Math.max(0, distanceKm - BASE_SHIPPING_DISTANCE_KM);

  return (
    Math.round((BASE_SHIPPING_FEE + extraKm * EXTRA_KM_SHIPPING_FEE) * 100) /
    100
  );
}

export function getRestaurantCoords(
  restaurant?: RestaurantShippingSource | null,
): Coords | null {
  const activeAddresses = (restaurant?.Address ?? []).filter(
    (address) => address.isActive !== false,
  );

  for (const address of activeAddresses) {
    const coords = parseShippingCoords(address.latitude, address.longitude);
    if (coords) return coords;
  }

  return null;
}

function parseExplicitRestaurantFee(
  rawFee: string | number | null | undefined,
): number | null {
  if (rawFee === null || rawFee === undefined || rawFee === "") return null;

  const normalized = String(rawFee).trim().replace(",", ".");
  if (!normalized || normalized === DEFAULT_DELIVERY_FEE) return null;

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return Math.round(parsed * 100) / 100;
}

/**
 * Resolve o frete que o checkout deve exibir e somar ao total:
 * - Em retirada (`pickup`), o frete é sempre R$ 0,00 (`isDeliveryFeeKnown: true`).
 * - Em entrega (`delivery`), quando temos as coordenadas da loja e do endereço
 *   do cliente, calculamos o mesmo valor que o backend grava em `POST /order/:id`.
 * - Se a API do restaurante informar um `deliveryFee` explícito (> 0), usamos ele.
 * - Caso contrário, o frete só será conhecido na finalização (`isDeliveryFeeKnown: false`),
 *   evitando mostrar "Grátis" indevidamente no checkout.
 */
export function resolveCheckoutShipping(params: {
  orderType: "delivery" | "pickup";
  restaurant?: RestaurantShippingSource | null;
  customerCoords?: Coords | null;
}): { deliveryFee: number; isDeliveryFeeKnown: boolean } {
  const { orderType, restaurant, customerCoords } = params;

  if (orderType === "pickup") {
    return { deliveryFee: 0, isDeliveryFeeKnown: true };
  }

  const storeCoords = getRestaurantCoords(restaurant);
  if (storeCoords && customerCoords) {
    return {
      deliveryFee: calculateShippingFeeFromCoords(storeCoords, customerCoords),
      isDeliveryFeeKnown: true,
    };
  }

  const explicitFee = parseExplicitRestaurantFee(restaurant?.deliveryFee);
  if (explicitFee !== null) {
    return {
      deliveryFee: explicitFee,
      isDeliveryFeeKnown: true,
    };
  }

  return { deliveryFee: 0, isDeliveryFeeKnown: false };
}

