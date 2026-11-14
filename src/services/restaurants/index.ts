import { Restaurant, UserLocation } from "@/types/restaurant";
import { apiService } from "@/services/api";
import { isSameCity, parseCoords } from "@/lib/geocode";

const isActive = (company: Restaurant) => company.status === "active";

/**
 * Endereços que valem para a loja. DELETE de endereço é soft delete
 * (isActive: false); isActive ausente conta como ativo.
 */
function getStoreAddresses(restaurant: Restaurant) {
  return (restaurant.Address ?? []).filter(
    (address) => address.isActive !== false,
  );
}

/**
 * A loja tem coordenada cadastrada? Se tiver, o backend consegue calcular a
 * distancia e a ausencia dela na busca por raio significa "longe demais".
 */
function hasMappedCoords(restaurant: Restaurant) {
  return getStoreAddresses(restaurant).some((address) =>
    parseCoords(address.latitude, address.longitude),
  );
}

/**
 * O filtro por raio do backend usa o primeiro endereço com coordenada sem
 * olhar isActive, entao uma loja cujo endereço foi apagado continua vindo
 * como dentro do raio. Só da para corrigir quando a resposta traz o
 * endereço apagado: sem essa informação, confiamos no backend.
 */
function hasOnlyDeletedCoords(restaurant: Restaurant) {
  const hasDeletedAddress = (restaurant.Address ?? []).some(
    (address) => address.isActive === false,
  );

  return hasDeletedAddress && !hasMappedCoords(restaurant);
}

function isInUserCity(restaurant: Restaurant, userCity?: string) {
  return getStoreAddresses(restaurant).some((address) =>
    isSameCity(address.city, userCity),
  );
}

export async function getActiveRestaurants(userLocation?: UserLocation) {
  if (!userLocation) {
    const response = await apiService.companies.getAll();

    if (!response.success || !response.data) {
      throw new Error("Falha ao carregar restaurantes");
    }

    return response.data.filter(isActive);
  }

  // Buscamos o catalogo completo em paralelo porque a busca por raio descarta
  // toda loja sem latitude/longitude cadastrada - inclusive as que ficam na
  // mesma cidade do cliente.
  const [nearbyResponse, catalogResponse] = await Promise.all([
    apiService.companies.getAll(userLocation),
    apiService.companies.getAll(),
  ]);

  if (!nearbyResponse.success || !nearbyResponse.data) {
    throw new Error("Falha ao carregar restaurantes");
  }

  const nearby = nearbyResponse.data.filter(isActive).map((restaurant) => ({
    ...restaurant,
    isWithinRadius: hasOnlyDeletedCoords(restaurant)
      ? false
      : (restaurant.isWithinRadius ?? true),
  }));

  if (!catalogResponse.success || !catalogResponse.data) return nearby;

  const nearbyIds = new Set(nearby.map((restaurant) => restaurant.id));

  // Loja sem geocodificação so entra se o endereço for da cidade do cliente.
  // Sem coordenada não ha como saber a distancia, entao ela vai marcada como
  // fora do raio: mesma cidade não quer dizer perto (LDMF-229).
  const unmappedInUserCity = catalogResponse.data
    .filter(
      (restaurant) =>
        isActive(restaurant) &&
        !nearbyIds.has(restaurant.id) &&
        !hasMappedCoords(restaurant) &&
        isInUserCity(restaurant, userLocation.city),
    )
    .map((restaurant) => ({ ...restaurant, isWithinRadius: false }));

  return [...nearby, ...unmappedInUserCity];
}
