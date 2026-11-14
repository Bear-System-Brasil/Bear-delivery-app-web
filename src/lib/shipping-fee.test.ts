import { describe, expect, it } from "vitest";
import { formatCurrency } from "@/utils/format-currency";
import {
  calculateShippingFeeFromCoords,
  calculateShippingFeeFromDistance,
  resolveCheckoutShipping,
  resolveStoreDeliveryFee,
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

describe("calculateShippingFeeFromDistance", () => {
  it("R$ 5,00 até 3 km e + R$ 2,00 por km acima, em 2 casas", () => {
    expect(calculateShippingFeeFromDistance(0)).toBe(5);
    expect(calculateShippingFeeFromDistance(3)).toBe(5);
    expect(calculateShippingFeeFromDistance(4.2)).toBe(7.4);
    expect(calculateShippingFeeFromDistance(10)).toBe(19);
  });
});

describe("resolveStoreDeliveryFee (LDMF-534)", () => {
  it("vale o frete que a API mandar, inclusive grátis", () => {
    expect(
      resolveStoreDeliveryFee({ deliveryFee: "6,90", distanceKm: 10 }),
    ).toMatchObject({ kind: "api", label: formatCurrency(6.9), isFree: false });
    expect(resolveStoreDeliveryFee({ deliveryFee: 0 })).toMatchObject({
      kind: "api",
      label: "Grátis",
      isFree: true,
    });
  });

  it("ignora o 99 de vitrine antigo", () => {
    expect(resolveStoreDeliveryFee({ deliveryFee: "99" }).kind).toBe("from");
  });

  it("estima pela distância da listagem", () => {
    expect(
      resolveStoreDeliveryFee({ deliveryFee: "", distanceKm: 4.2 }),
    ).toMatchObject({
      kind: "estimate",
      label: formatCurrency(7.4),
      isFree: false,
    });
  });

  it("estima pelas coordenadas da loja e do cliente (mesma conta do checkout)", () => {
    const customerCoords = { lat: -8.07, lng: -34.874124 };
    const result = resolveStoreDeliveryFee({
      storeCoords: STORE_COORDS,
      customerCoords,
    });
    expect(result.kind).toBe("estimate");
    expect(result.label).toBe(
      formatCurrency(
        calculateShippingFeeFromCoords(STORE_COORDS, customerCoords),
      ),
    );
  });

  it("sem distância nem coordenadas, mostra 'a partir de R$ 5,00'", () => {
    const result = resolveStoreDeliveryFee({ deliveryFee: null });
    expect(result).toMatchObject({
      kind: "from",
      label: `a partir de ${formatCurrency(5)}`,
      valueLabel: formatCurrency(5),
      isFree: false,
    });
    expect(
      resolveStoreDeliveryFee({ storeCoords: STORE_COORDS, customerCoords: null })
        .kind,
    ).toBe("from");
  });
});
