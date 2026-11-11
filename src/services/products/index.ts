import { apiService, MAX_PAGE_LIMIT, toPaginated } from "../api";

/**
 * Sem paginação de verdade (ver pagination.md): a tela de cardápio depende
 * de busca/filtro instantâneo no cliente sobre a lista inteira, então
 * pedimos o limite máximo (100) numa página só em vez de Prev/Next -
 * cardápios raramente passam disso, e evita quebrar a busca existente.
 */
export async function getCompanyProducts(companyId: string) {
  if (!companyId) throw new Error("Company ID is required");

  const response = await apiService.getProductsByCompany(companyId, {
    page: 1,
    limit: MAX_PAGE_LIMIT,
  });

  if (!response.success || !response.data) {
    throw new Error("Falha ao carregar produtos");
  }

  // toPaginated aceita envelope e array cru (LDMF-495).
  return toPaginated(response.data).items;
}
