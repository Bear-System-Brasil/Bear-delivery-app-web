import { resolveStoreDeliveryFee } from "@/lib/shipping-fee";
import {
  apiService,
  toPaginated,
  type Product,
  type RecentProduct,
} from "@/services/api";
import type { Restaurant, UserLocation } from "@/types/restaurant";
import { parseDeliveryMaxMinutes } from "@/utils/format-delivery-fee";

/** Prato da seção "Novidades" já no formato que o card consome. */
export interface NewDish {
  id: string;
  name: string;
  price: number;
  /** Preço cheio quando o prato está em promoção; `null` fora dela. */
  originalPrice: number | null;
  /** 0 quando não há promoção. */
  discountPercent: number;
  imageUrl: string | null;
  createdAt: string | null;
  /** Produto cru, é o que o modal `CustomizeOrder` recebe. */
  product: Product;
  restaurant: {
    id: string;
    name: string;
    logoUrl: string | null;
    deliveryFeeLabel: string | null;
    isFreeDelivery: boolean;
    deliveryTimeLabel: string | null;
    deliveryMaxMinutes: number | null;
  };
}

/** Quantas lojas perto entram na agregação e quantos pratos cada uma cede. */
const MAX_STORES = 8;
const PRODUCTS_PER_STORE = 6;
/** Tamanho do carrossel. */
export const MAX_NEW_DISHES = 12;

// `distanceKm` vem da listagem de lojas (não do contrato de /product/recent):
// serve só para estimar o frete do card (LDMF-534).
type StoreSummary = RecentProduct["company"] & { distanceKm?: number };

// GET /product/recent ainda não existe (ver RecentProduct). Depois do
// primeiro 404 da sessão paramos de tentar e vamos direto na agregação -
// quando o backend publicar a rota, basta recarregar a página.
let recentEndpointMissing = false;

function toStoreSummary(restaurant: Restaurant): StoreSummary {
  return {
    id: restaurant.id,
    tradeName: restaurant.tradeName,
    logo_url: restaurant.logo_url,
    deliveryFee: restaurant.deliveryFee,
    time: restaurant.time,
    isOpen: restaurant.isOpen,
    distanceKm: restaurant.distanceKm,
  };
}

function toNewDish(
  product: Product,
  store: StoreSummary,
  extra: { createdAt?: string | null; promotionalPrice?: number | null } = {},
): NewDish {
  const fullPrice = Number(product.salePrice || 0);
  const promo = Number(extra.promotionalPrice);
  const hasPromo = Number.isFinite(promo) && promo > 0 && promo < fullPrice;
  // Frete do back quando vier; senão, estimativa pela distância ou "a partir
  // de". Tempo só quando a API mandar - não existe tempo antes do pedido
  // (LDMF-534).
  const deliveryFee = resolveStoreDeliveryFee({
    deliveryFee: store.deliveryFee,
    distanceKm: store.distanceKm,
  });
  const deliveryTime = store.time?.trim() || null;

  return {
    id: product.id,
    name: product.name,
    price: hasPromo ? promo : fullPrice,
    originalPrice: hasPromo ? fullPrice : null,
    discountPercent: hasPromo
      ? Math.round(((fullPrice - promo) / fullPrice) * 100)
      : 0,
    imageUrl: product.imageURL?.[0]?.url || null,
    createdAt: extra.createdAt ?? null,
    product,
    restaurant: {
      id: store.id,
      name: store.tradeName,
      logoUrl: store.logo_url || null,
      deliveryFeeLabel: deliveryFee.label,
      isFreeDelivery: deliveryFee.isFree,
      deliveryTimeLabel: deliveryTime,
      deliveryMaxMinutes: parseDeliveryMaxMinutes(deliveryTime),
    },
  };
}

const isSellable = (product: Product) => product.isAvailable !== false;

/**
 * Intercala os pratos loja a loja (1ª de cada, depois 2ª de cada...) pra o
 * carrossel não abrir com seis pizzas da mesma pizzaria em sequência.
 */
function interleave<T>(groups: T[][], limit: number): T[] {
  const out: T[] = [];
  const longest = Math.max(0, ...groups.map((group) => group.length));

  for (let index = 0; index < longest && out.length < limit; index++) {
    for (const group of groups) {
      if (index < group.length) out.push(group[index]);
      if (out.length >= limit) break;
    }
  }

  return out;
}

async function fetchRecentFromBackend(
  location?: UserLocation | null,
): Promise<NewDish[] | null> {
  if (recentEndpointMissing) return null;

  const response = await apiService.getRecentProducts({
    lat: location?.lat,
    lng: location?.lng,
    limit: MAX_NEW_DISHES,
  });

  if (!response.success) {
    if (response.status === 404) recentEndpointMissing = true;
    return null;
  }

  const { items } = toPaginated<RecentProduct>(response.data);

  return items
    .filter((item) => isSellable(item) && item.company?.id)
    .map((item) =>
      toNewDish(item, item.company, {
        createdAt: item.created_at,
        promotionalPrice: item.promotionalPrice,
      }),
    )
    .slice(0, MAX_NEW_DISHES);
}

/**
 * Fallback enquanto não há rota de recentes: pega os pratos das primeiras
 * lojas perto do cliente (abertas primeiro), com foto na frente. A listagem
 * por loja não traz `created_at`, então a ordem é a que a API devolve.
 */
async function aggregateFromStores(
  restaurants: Restaurant[],
): Promise<NewDish[]> {
  const stores = [...restaurants]
    .sort((a, b) => Number(b.isOpen) - Number(a.isOpen))
    .slice(0, MAX_STORES);

  const results = await Promise.allSettled(
    stores.map((store) =>
      apiService.getProductsByCompany(store.id, {
        page: 1,
        limit: PRODUCTS_PER_STORE,
      }),
    ),
  );

  const groups = results.map((result, index) => {
    if (result.status !== "fulfilled" || !result.value.success) return [];

    const store = toStoreSummary(stores[index]);
    const { items } = toPaginated<Product>(result.value.data);

    return items
      .filter(isSellable)
      .sort(
        (a, b) =>
          Number(Boolean(b.imageURL?.length)) -
          Number(Boolean(a.imageURL?.length)),
      )
      .map((product) => toNewDish(product, store));
  });

  return interleave(groups, MAX_NEW_DISHES);
}

/**
 * Pratos que acabaram de entrar perto do cliente. `restaurants` já é a
 * lista dentro do raio (mesma das Lojas), então o fallback por loja herda o
 * "perto de você" sem precisar de lat/lng.
 */
export async function getNewDishes(
  restaurants: Restaurant[],
  location?: UserLocation | null,
): Promise<NewDish[]> {
  const fromBackend = await fetchRecentFromBackend(location);
  if (fromBackend) return fromBackend;

  return aggregateFromStores(restaurants);
}
