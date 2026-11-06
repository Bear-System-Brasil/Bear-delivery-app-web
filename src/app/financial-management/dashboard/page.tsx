"use client";

/**
 * Painel financeiro. Mostra e leva — nunca opera.
 *
 * Nenhum botão aqui altera dado: abrir/fechar caixa e movimentos vivem em
 * /financial-management/cash-register, aprovação de pagamento em /finance.
 * Os cartões acionáveis são links para essas telas.
 */

import { AdminPageLayout } from "@/components/admin-page-layout";
import {
  AttentionBand,
  LeaksBand,
  ResultBand,
  TrendsBand,
} from "@/components/financial-dashboard/bands";
import { PeriodSelector } from "@/components/financial-dashboard/period-selector";
import { useFinancialDashboard } from "@/hooks";
import { LayoutDashboard } from "lucide-react";

export default function FinancialDashboardPage() {
  const dashboard = useFinancialDashboard();

  return (
    <AdminPageLayout
      title="Dashboard"
      icon={LayoutDashboard}
      mainClassName="p-4 pb-20 sm:p-6 md:pb-10 lg:px-8"
      action={{
        label: "Atualizar",
        busyLabel: "Atualizando...",
        onClick: dashboard.refetch,
        busy: dashboard.isFetching,
      }}
    >
      <div className="mx-auto max-w-6xl">
        <PeriodSelector
          period={dashboard.period}
          onPeriodChange={dashboard.setPeriod}
          customRange={dashboard.customRange}
          onCustomRangeChange={dashboard.setCustomRange}
        />

        {/* Some por completo quando não há pendência nem caixa aberto. */}
        <AttentionBand dashboard={dashboard} />

        {dashboard.isError ? (
          <div className="rounded-[13px] border border-border bg-card px-5 py-10 text-center">
            <div className="text-[26px]">📉</div>
            <div className="mt-2 text-[13.5px] font-bold text-foreground">
              Não foi possível carregar o período
            </div>
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">
              {dashboard.error instanceof Error
                ? dashboard.error.message
                : "Tente atualizar em instantes."}
            </div>
          </div>
        ) : dashboard.isEmpty ? (
          <div className="rounded-[13px] border border-dashed border-border bg-card px-5 py-10 text-center">
            <div className="text-[26px]">🗓️</div>
            <div className="mt-2 text-[13.5px] font-bold text-foreground">
              Nenhum movimento neste período
            </div>
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">
              Escolha outro período no seletor acima.
            </div>
          </div>
        ) : (
          <>
            <ResultBand dashboard={dashboard} />
            <LeaksBand dashboard={dashboard} />
            <TrendsBand dashboard={dashboard} />
          </>
        )}
      </div>
    </AdminPageLayout>
  );
}
