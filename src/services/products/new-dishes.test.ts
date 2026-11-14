import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Product } from "@/services/api";
import type { Restaurant } from "@/types/restaurant";
import { formatCurrency } from "@/utils/format-currency";

/**
 * "Novidades" tem duas fontes: a rota de recentes (ainda não existe no
 * backend) e a agregação por loja. Estes testes travam a troca entre elas e
 * o formato que o card recebe, pra a UI não precisar saber de onde veio.
 */

const getRecentProducts = vi.fn();
const getProductsByCompany = vi.fn();

vi.mock("@/services/api", async () => {
  const actual =
    await vi.importActual<typeof import("@/services/api")>("@/services/api");
  return {
    ...actual,
    apiService: {
      ...actual.apiService,
      getRecentProducts: (...args: unknown[]) => getRecentProducts(...args),
      getProductsByCompany: (...args: unknown[]) =>
        getProductsByCompany(...args),
    },
  };
});

function store(id: string, overrides: Partial<Restaurant> = {}): Restaurant {
  return {
    id,
    tradeName: `Loja ${id}`,
    description: "",
    logo_url: "",
    cover_url: "",
    phone: "",
    time: "",
    deliveryFee: "",
    rating: 0,
    discount: 0,
    actionRadius: 5,
    totalReviews: 0,
    isOpen: true,
    trending: false,
    status: "active",
    openingHours: [],
    categories: [],
    ...overrides,
  };
}

function product(
  id: string,
  companyId: string,
  overrides: Partial<Product> = {},
): Product {
  return {
    id,
    companyId,
    name: `Prato ${id}`,
    description: "",
    salePrice: 10,
    isAvailable: true,
    imageURL: [],
    ...overrides,
  };
}

const notFound = { success: false, status: 404, message: "Not Found" };

describe("getNewDishes", () => {
  beforeEach(() => {
    vi.resetModules();
    getRecentProducts.mockReset();
    getProductsByCompany.mockReset();
  });

  it("cai na agregação por loja quando /product/recent responde 404 e intercala as lojas", async () => {
    const { getNewDishes } = await import("./new-dishes");
    getRecentProducts.mockResolvedValue(notFound);
    getProductsByCompany.mockImplementation(async (companyId: string) => ({
      success: true,
      data: {
        data:
          companyId === "a"
            ? [
                product("a1", "a"),
                product("a2", "a", {
                  imageURL: [
                    {
                      id: "img",
                      url: "https://cdn/a2.png",
                      productId: "a2",
                      created_at: "",
                      updated_at: "",
                    },
                  ],
                }),
                product("a3", "a", { isAvailable: false }),
              ]
            : [product("b1", "b")],
        meta: { page: 1, limit: 6, total: 3, totalPages: 1 },
      },
    }));

    const dishes = await getNewDishes([store("a"), store("b")]);

    // com foto primeiro, uma loja por vez, indisponível fora
    expect(dishes.map((dish) => dish.id)).toEqual(["a2", "b1", "a1"]);
    expect(dishes[0].imageUrl).toBe("https://cdn/a2.png");
    // loja sem frete/tempo na API e sem distância: frete "a partir de" e
    // nenhum tempo inventado (LDMF-534)
    expect(dishes[0].restaurant).toMatchObject({
      id: "a",
      name: "Loja a",
      deliveryFeeLabel: `a partir de ${formatCurrency(5)}`,
      isFreeDelivery: false,
      deliveryTimeLabel: null,
      deliveryMaxMinutes: null,
    });
    expect(dishes[0].discountPercent).toBe(0);
    expect(dishes[0].originalPrice).toBeNull();
  });

  it("estima o frete pela distância da loja e mostra o tempo só se a API mandar (LDMF-534)", async () => {
    const { getNewDishes } = await import("./new-dishes");
    getRecentProducts.mockResolvedValue(notFound);
    getProductsByCompany.mockResolvedValue({
      success: true,
      data: {
        data: [product("a1", "a")],
        meta: { page: 1, limit: 6, total: 1, totalPages: 1 },
      },
    });

    const dishes = await getNewDishes([
      store("a", { distanceKm: 4.2, time: "20-30 min" }),
    ]);

    expect(dishes[0].restaurant).toMatchObject({
      deliveryFeeLabel: formatCurrency(7.4),
      isFreeDelivery: false,
      deliveryTimeLabel: "20-30 min",
      deliveryMaxMinutes: 30,
    });
  });

  it("depois do primeiro 404 não bate mais na rota de recentes", async () => {
    const { getNewDishes } = await import("./new-dishes");
    getRecentProducts.mockResolvedValue(notFound);
    getProductsByCompany.mockResolvedValue({
      success: true,
      data: { data: [], meta: { page: 1, limit: 6, total: 0, totalPages: 0 } },
    });

    await getNewDishes([store("a")]);
    await getNewDishes([store("a")]);

    expect(getRecentProducts).toHaveBeenCalledTimes(1);
  });

  it("usa a rota de recentes quando ela existe, com promoção e dados da loja", async () => {
    const { getNewDishes } = await import("./new-dishes");
    getRecentProducts.mockResolvedValue({
      success: true,
      data: [
        {
          ...product("p1", "a", { salePrice: 69 }),
          created_at: "2026-09-19T10:00:00Z",
          promotionalPrice: 58,
          company: {
            id: "a",
            tradeName: "Janta na Brasa",
            deliveryFee: "0",
            time: "40-50 min",
          },
        },
      ],
    });

    const dishes = await getNewDishes([store("a")], { lat: -23.5, lng: -46.6 });

    expect(getProductsByCompany).not.toHaveBeenCalled();
    expect(getRecentProducts).toHaveBeenCalledWith({
      lat: -23.5,
      lng: -46.6,
      limit: 12,
    });
    expect(dishes).toHaveLength(1);
    expect(dishes[0]).toMatchObject({
      id: "p1",
      price: 58,
      originalPrice: 69,
      discountPercent: 16,
      createdAt: "2026-09-19T10:00:00Z",
      restaurant: {
        name: "Janta na Brasa",
        deliveryFeeLabel: "Grátis",
        isFreeDelivery: true,
        deliveryTimeLabel: "40-50 min",
        deliveryMaxMinutes: 50,
      },
    });
  });

  it("uma loja que falha não derruba as outras", async () => {
    const { getNewDishes } = await import("./new-dishes");
    getRecentProducts.mockResolvedValue(notFound);
    getProductsByCompany.mockImplementation(async (companyId: string) =>
      companyId === "a"
        ? Promise.reject(new Error("rede"))
        : {
            success: true,
            data: {
              data: [product("b1", "b")],
              meta: { page: 1, limit: 6, total: 1, totalPages: 1 },
            },
          },
    );

    const dishes = await getNewDishes([store("a"), store("b")]);

    expect(dishes.map((dish) => dish.id)).toEqual(["b1"]);
  });
});
