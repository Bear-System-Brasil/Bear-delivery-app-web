"use client";

/** As quatro faixas do painel. Todas recebem dado pronto por prop. */

import {
  BandSkeleton,
  BandTitle,
  DeltaBadge,
  LinkCard,
  MetricCard,
  cardClass,
} from "@/components/financial-dashboard/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { useFinancialDashboard } from "@/hooks/use-financial-dashboard";
import { formatCurrency } from "@/utils";
import { TriangleAlert, Unlock, Wallet } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Dashboard = ReturnType<typeof useFinancialDashboard>;

const CASH_REGISTER_HREF = "/financial-management/cash-register";
const FINANCE_HREF = "/financial-management/finance";

function formatPercent(value: number | null, fallback = "—") {
  if (value === null) return fallback;
  return `${(value * 100).toFixed(1)}%`;
}

function formatHours(hours: number) {
  const totalMinutes = Math.floor(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h === 0 ? `há ${m} min` : `há ${h}h${String(m).padStart(2, "0")}`;
}

function formatTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatDayLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

// ======================
// Faixa 1 — Precisa de atenção
// ======================

export function AttentionBand({ dashboard }: { dashboard: Dashboard }) {
  const { attention, attentionLoading, hasAttention } = dashboard;

  if (attentionLoading) {
    return (
      <section className="mb-4">
        <BandTitle>Precisa de atenção</BandTitle>
        <Skeleton className="h-[86px] w-full rounded-[13px]" />
      </section>
    );
  }

  // Nada pendente e nenhum caixa aberto: a faixa some por completo.
  if (!hasAttention) return null;

  const { pendingPayments, register, availableBalance, openForHours, isLongShift } =
    attention;

  return (
    <section className="mb-4">
      <BandTitle>Precisa de atenção</BandTitle>
      <div className="flex flex-col gap-2.5">
        {attention.hasPendingPayments && pendingPayments && (
          <LinkCard
            href={FINANCE_HREF}
            icon={<Wallet className="h-[19px] w-[19px]" />}
            label="Pagamentos pendentes"
            value={`${pendingPayments.count} ${
              pendingPayments.count === 1 ? "pagamento" : "pagamentos"
            }`}
            sub={
              pendingPayments.partialAmount
                ? `${formatCurrency(pendingPayments.amount)} nos mais recentes`
                : `${formatCurrency(pendingPayments.amount)} aguardando aprovação`
            }
            action="Ver no financeiro"
          />
        )}

        {attention.isRegisterOpen && (
          <LinkCard
            href={CASH_REGISTER_HREF}
            alert={isLongShift}
            icon={
              isLongShift ? (
                <TriangleAlert className="h-[19px] w-[19px]" />
              ) : (
                <Unlock className="h-[19px] w-[19px]" />
              )
            }
            label="Caixa aberto"
            value={
              availableBalance === null ? "—" : formatCurrency(availableBalance)
            }
            sub={
              <>
                Desde {formatTime(register?.openedAt)}
                {openForHours !== null && ` · ${formatHours(openForHours)}`}
                {isLongShift && " · aberto há mais de 12 horas"}
              </>
            }
            action="Ir para o caixa"
          />
        )}
      </div>
    </section>
  );
}

// ======================
// Faixa 2 — Resultado do período
// ======================

export function ResultBand({ dashboard }: { dashboard: Dashboard }) {
  const { result, isLoading } = dashboard;

  return (
    <section className="mb-4">
      <BandTitle hint="Comparado ao período anterior equivalente">
        Resultado do período
      </BandTitle>

      {isLoading ? (
        <BandSkeleton cards={4} />
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:[grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
          <MetricCard
            label="Margem"
            emphasis
            value={formatPercent(result.margin)}
            sub={
              result.margin === null
                ? "Sem receita no período"
                : "Receita menos despesas"
            }
            delta={<DeltaBadge value={result.marginChange} unit="points" />}
          />
          <MetricCard
            label="Receita"
            value={formatCurrency(result.revenue)}
            delta={<DeltaBadge value={result.revenueChange} />}
          />
          <MetricCard
            label="Despesas"
            value={formatCurrency(result.expenses)}
            delta={<DeltaBadge value={result.expensesChange} invert />}
          />
          <MetricCard
            label="Ticket médio"
            value={
              result.averageTicket === null
                ? "—"
                : formatCurrency(result.averageTicket)
            }
            sub={
              result.orders === 0
                ? "Sem pedidos no período"
                : `${result.orders} ${result.orders === 1 ? "pedido" : "pedidos"}`
            }
            delta={<DeltaBadge value={result.averageTicketChange} />}
          />
        </div>
      )}
    </section>
  );
}

// ======================
// Faixa 3 — Onde o dinheiro vaza
// ======================

export function LeaksBand({ dashboard }: { dashboard: Dashboard }) {
  const { leaks, isLoading } = dashboard;

  return (
    <section className="mb-4">
      <BandTitle>Onde o dinheiro vaza</BandTitle>

      {isLoading ? (
        <BandSkeleton cards={3} />
      ) : (
        <div className="grid grid-cols-1 gap-2.5 lg:[grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          <MetricCard
            label="Taxa de cancelamento"
            value={formatPercent(leaks.cancellation.rate)}
            sub={
              leaks.cancellation.rate === null
                ? "Sem pedidos no período"
                : `${leaks.cancellation.count} ${
                    leaks.cancellation.count === 1 ? "pedido" : "pedidos"
                  } cancelados`
            }
          />

          <MetricCard
            label="Receita presa"
            value={formatCurrency(leaks.stuckRevenue)}
            sub="Venda feita e ainda não realizada"
          />

          <div className={cn(cardClass, "lg:col-span-2")}>
            <div className="text-[11.5px] font-semibold text-muted-foreground">
              Composição das despesas
            </div>

            {leaks.expenses.length === 0 ||
            leaks.expenses.every((slice) => slice.value === 0) ? (
              <p className="mt-2 text-[12px] font-semibold text-muted-foreground">
                Sem despesas registradas no período.
              </p>
            ) : (
              <div className="mt-2.5 flex flex-col gap-[11px]">
                {leaks.expenses.map((slice) => (
                  <div key={slice.key}>
                    <div className="flex items-center gap-2">
                      <span className="min-w-[90px] flex-1 truncate text-[12.5px] font-bold text-foreground">
                        {slice.label}
                      </span>
                      <span className="w-[92px] shrink-0 text-right text-[12.5px] font-extrabold text-foreground">
                        {formatCurrency(slice.value)}
                      </span>
                      <span className="w-[38px] shrink-0 text-right text-[11px] font-bold text-muted-foreground">
                        {Math.round(slice.share * 100)}%
                      </span>
                    </div>
                    <div className="mt-[5px] h-[5px] overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${Math.min(slice.share * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ======================
// Faixa 4 — Tendência e concentração
// ======================

export function TrendsBand({ dashboard }: { dashboard: Dashboard }) {
  const { trends, isLoading } = dashboard;

  const chartData = trends.revenueByDay.map((point) => ({
    ...point,
    label: formatDayLabel(point.date),
  }));

  return (
    <section className="mb-4">
      <BandTitle>Tendência e concentração</BandTitle>

      {isLoading ? (
        <BandSkeleton cards={2} />
      ) : (
        <div className="grid grid-cols-1 gap-2.5 lg:[grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
          <div className={cardClass}>
            <div className="text-[11.5px] font-semibold text-muted-foreground">
              Receita por dia
            </div>

            {chartData.length === 0 ? (
              <p className="mt-2 text-[12px] font-semibold text-muted-foreground">
                Sem receita registrada no período.
              </p>
            ) : (
              <div className="mt-3 h-[190px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 4, right: 8, bottom: 0, left: -12 }}
                  >
                    <CartesianGrid stroke="#F0F1F4" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "#A2A7B0" }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "#A2A7B0" }}
                      width={64}
                      tickFormatter={(value: number) => formatCurrency(value)}
                    />
                    <Tooltip
                      formatter={(value: number) => [
                        formatCurrency(value),
                        "Receita",
                      ]}
                      labelFormatter={(label: string) => `Dia ${label}`}
                      contentStyle={{
                        borderRadius: 10,
                        border: "1px solid #E9EAEE",
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="totalRevenue"
                      stroke="var(--color-brand-500)"
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className={cardClass}>
            <div className="text-[11.5px] font-semibold text-muted-foreground">
              Top produtos
            </div>

            {trends.topProducts.length === 0 ? (
              <p className="mt-2 text-[12px] font-semibold text-muted-foreground">
                Sem produtos vendidos no período.
              </p>
            ) : (
              <div className="mt-2.5 flex flex-col gap-2">
                {trends.topProducts.slice(0, 6).map((product, index) => (
                  <div
                    key={product.productId || product.name}
                    className="flex items-center gap-2.5"
                  >
                    <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] bg-muted text-[11px] font-extrabold text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-foreground">
                      {product.name}
                    </span>
                    <span className="shrink-0 text-[12.5px] font-extrabold text-foreground">
                      {product.totalQuantity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Capital em estoque fica fora do bloco acima de propósito: é foto do
          momento, não resultado do período, e o filtro de data não o altera. */}
      {!isLoading && trends.stockCost !== null && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-[13px] border border-dashed border-border bg-muted px-4 py-[13px]">
          <div>
            <div className="text-[11.5px] font-semibold text-muted-foreground">
              Capital em estoque
            </div>
            <div className="mt-0.5 text-[19px] font-extrabold tracking-tight text-foreground">
              {formatCurrency(trends.stockCost)}
            </div>
          </div>
          <p className="max-w-[320px] text-[11px] font-semibold text-muted-foreground">
            Foto do estoque agora. Não é despesa do período, não entra na
            margem e não muda com o filtro de data.
          </p>
        </div>
      )}
    </section>
  );
}
