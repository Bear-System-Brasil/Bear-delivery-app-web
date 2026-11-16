import { useQuery } from "@tanstack/react-query";

import { apiService, type CompanyReviewsSummary } from "@/services/api";

export const companyReviewsKey = (companyId?: string | null) =>
  ["company-reviews", companyId] as const;

async function fetchCompanyReviews(
  companyId: string,
): Promise<CompanyReviewsSummary> {
  const response = await apiService.reviews.getByCompany(companyId);
  if (!response.success || !response.data) {
    throw new Error(response.message || "Falha ao carregar avaliações");
  }
  const { data, average, total } = response.data;
  return {
    data: Array.isArray(data) ? data : [],
    average: Number.isFinite(Number(average)) ? Number(average) : 0,
    total: Number.isFinite(Number(total)) ? Number(total) : 0,
  };
}

/**
 * Avaliações públicas da loja (LDMF-498). Avaliação nova só entra depois de
 * um pedido concluído, então o cache padrão de 5 min basta.
 */
export function useCompanyReviews(companyId?: string | null) {
  return useQuery({
    queryKey: companyReviewsKey(companyId),
    queryFn: () => fetchCompanyReviews(companyId as string),
    enabled: Boolean(companyId),
  });
}
