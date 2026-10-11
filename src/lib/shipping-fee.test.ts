import { describe, expect, it } from "vitest";
import {
  calculateShippingFeeFromCoords,
  resolveCheckoutShipping,
} from "./shipping-fee";

const STORE_COORDS = { lat: -8.062916, lng: -34.874124 };

describe("calculateShippingFeeFromCoords", () => {
  it("cobra taxa mínima de R$ 5,00 para distâncias de até 3 km", () => {
    expect(
      calculateShippingFeeFromCoords(STORE_COORDS, {
        lat: -8.07,
        lng: -34.874124,
      }),
    ).toBe(5);

    expect(
      calculateShippingFeeFromCoords(STORE_COORDS, {
        lat: -8.08,
        lng: -34.874124,
      }),
    ).toBe(5);
  });

  it("soma R$ 2,00 por km excedente acima de 3 km", () => {
    expect(
      calculateShippingFeeFromCoords(STORE_COORDS, {
        lat: -8.09,
        lng: -34.874124,
      }),
    ).toBe(5.02);

    expect(
      calculateShippingFeeFromCoords(STORE_COORDS, {
        lat: -8.1,
        lng: -34.874124,
      }),
    ).toBe(7.25);

    expect(
      calculateShippingFeeFromCoords(STORE_COORDS, {
        lat: -8.11,
        lng: -34.89,
      }),
    ).toBe(10.04);
  });
});

describe("resolveCheckoutShipping", () => {
  it("retirada no local tem frete 0 e conhecido", () => {
    expect(
      resolveCheckoutShipping({
        orderType: "pickup",
        restaurant: {
          Address: [
            {
              latitude: STORE_COORDS.lat,
              longitude: STORE_COORDS.lng,
              isActive: true,
            },
          ],
        },
        customerCoords: { lat: -8.07, lng: -34.874124 },
      }),
    ).toEqual({
      deliveryFee: 0,
      isDeliveryFeeKnown: true,
    });
  });

  it("calcula o frete na entrega quando loja e cliente têm coordenadas", () => {
    expect(
      resolveCheckoutShipping({
        orderType: "delivery",
        restaurant: {
          Address: [
            {
              latitude: STORE_COORDS.lat,
              longitude: STORE_COORDS.lng,
              isActive: true,
            },
          ],
        },
        customerCoords: { lat: -8.07, lng: -34.874124 },
      }),
    ).toEqual({
      deliveryFee: 5,
      isDeliveryFeeKnown: true,
    });
  });

  it("marca isDeliveryFeeKnown como false quando faltam coordenadas e não há deliveryFee explícito", () => {
    expect(
      resolveCheckoutShipping({
        orderType: "delivery",
        restaurant: { id: "comp-1" } as never,
        customerCoords: null,
      }),
    ).toEqual({
      deliveryFee: 0,
      isDeliveryFeeKnown: false,
    });
  });

  it("ignora o placeholder 99 e usa deliveryFee explícito quando positivo", () => {
    expect(
      resolveCheckoutShipping({
        orderType: "delivery",
        restaurant: { deliveryFee: "99" },
        customerCoords: null,
      }),
    ).toEqual({
      deliveryFee: 0,
      isDeliveryFeeKnown: false,
    });

    expect(
      resolveCheckoutShipping({
        orderType: "delivery",
        restaurant: { deliveryFee: "8.50" },
        customerCoords: null,
      }),
    ).toEqual({
      deliveryFee: 8.5,
      isDeliveryFeeKnown: true,
    });
  });
});
