"use client";

/**
 * Toda a busca de dados do painel financeiro vive aqui.
 *
 * A tela recebe faixas prontas e não sabe de onde vieram - o mesmo desenho de
 * `use-kitchen-orders` sobre `services/kitchen`. O painel é de leitura: este
 * hook não expõe nenhuma mutação.
 */

import {
  DEFAULT_PERIOD,
  cancellationRate,
  expenseBreakdown,
  fetchPendingPayments,
  fetchReport,
  getPeriodRange,
  getPreviousRange,
  isEmptyReport,
  margin,
  averageTicket,
  percentChange,
  stuckRevenue,
  type CustomRange,
  type DashboardPeriod,
  type DateRange,
} from "@/services/financial-dashboard";
import { useCashMovementSummary } from "@/hooks/use-cash-movement";
import { useCashRegister } from "@/hooks/use-cash-register";
import { useAuthStore } from "@/stores";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

/** Caixa aberto além disso aparece destacado - costuma ser caixa esquecido. */
export const LONG_SHIFT_HOURS = 12;

const REPORT_STALE_TIME = 60_000;

function useReport(range: DateRange, enabled: boolean) {
  return useQuery({
    queryKey: ["financial-dashboard", "report", range.startDate, range.endDate],
    queryFn: () => fetchReport(range),
    enabled,
    staleTime: REPORT_STALE_TIME,
    retry: false,
    placeholderData: (previous) => previous,
  });
}

export function useFinancialDashboard() {
  const { isAuthenticated } = useAuthStore();

  const [period, setPeriod] = useState<DashboardPeriod>(DEFAULT_PERIOD);
  const [customRange, setCustomRange] = useState<CustomRange>({
    from: "",
    to: "",
  });

  // O intervalo só muda quando o seletor muda; sem isso cada render criaria
  // uma chave de query nova (o range carrega a hora atual) e a tela buscaria
  // em loop.
  const range = useMemo(
    () => getPeriodRange(period, customRange),
    [period, customRange],
  );
  const previousRange = useMemo(
    () => getPreviousRange(period, customRange),
    [period, customRange],
  );

  const current = useReport(range, !!isAuthenticated);
  const previous = useReport(previousRange, !!isAuthenticated);

  const pendingPayments = useQuery({
    queryKey: ["financial-dashboard", "pending-payments"],
    queryFn: fetchPendingPayments,
    enabled: !!isAuthenticated,
    staleTime: REPORT_STALE_TIME,
    retry: false,
  });

  // Reaproveita as queries da tela de caixa: mesmo cache, sem risco de o
  // painel e o caixa mostrarem saldos diferentes.
  const register = useCashRegister();
  const cashSummary = useCashMovementSummary();

  const report = current.data;
  const previousReport = previous.data;

  const result = useMemo(() => {
    const revenue = report?.totalRevenue ?? 0;
    const expenses = report?.totalExpenses?.totalExpenses ?? 0;
    const orders = report?.totalOrders ?? 0;

    const previousRevenue = previousReport?.totalRevenue ?? 0;
    const previousExpenses = previousReport?.totalExpenses?.totalExpenses ?? 0;
    const previousOrders = previousReport?.totalOrders ?? 0;

    return {
      revenue,
      revenueChange: percentChange(revenue, previousRevenue),
      expenses,
      expensesChange: percentChange(expenses, previousExpenses),
      margin: margin(revenue, expenses),
      marginChange: (() => {
        const now = margin(revenue, expenses);
        const before = margin(previousRevenue, previousExpenses);
        // Margem já é percentual: a variação é a diferença em pontos, não a
        // variação relativa de um percentual sobre o outro.
        return now === null || before === null ? null : now - before;
      })(),
      averageTicket: averageTicket(revenue, orders),
      averageTicketChange: percentChange(
        averageTicket(revenue, orders) ?? 0,
        averageTicket(previousRevenue, previousOrders) ?? 0,
      ),
      orders,
    };
  }, [report, previousReport]);

  const leaks = useMemo(
    () => ({
      cancellation: cancellationRate(report?.ordersByStatus),
      stuckRevenue: stuckRevenue(report?.revenueByOrderStatus),
      expenses: expenseBreakdown(report?.totalExpenses),
    }),
    [report],
  );

  const trends = useMemo(
    () => ({
      revenueByDay: report?.revenueByDay ?? [],
      topProducts: report?.topProducts ?? [],
      // O back calcula custo x quantidade em estoque, e o prato/tamanho sem
      // controle de estoque grava um número irreal (lib/unlimited-stock),
      // o que dava bilhões aqui. Até o back ter estoque de verdade, o capital
      // em estoque fica em 0 e o custo só considera pedidos já feitos.
      stockCost: report ? 0 : null,
    }),
    [report],
  );

  const openedAt = register.data?.openedAt;
  const openForHours = useMemo(() => {
    if (!openedAt) return null;
    const date = new Date(openedAt);
    if (Number.isNaN(date.getTime())) return null;
    return Math.max(0, (Date.now() - date.getTime()) / 3_600_000);
    // `cashSummary.dataUpdatedAt` entra na lista porque o resumo do caixa
    // refaz a busca a cada minuto: é o que mantém o "há Xh" andando.
  }, [openedAt, cashSummary.dataUpdatedAt]);

  const attention = {
    pendingPayments: pendingPayments.data,
    hasPendingPayments: (pendingPayments.data?.count ?? 0) > 0,
    register: register.data ?? null,
    isRegisterOpen: !!register.data,
    availableBalance: cashSummary.data?.availableBalance ?? null,
    openForHours,
    isLongShift: openForHours !== null && openForHours >= LONG_SHIFT_HOURS,
  };

  return {
    period,
    setPeriod,
    customRange,
    setCustomRange,
    range,
    previousRange,

    /** Alguma faixa ainda carregando o relatório do período. */
    isLoading: current.isLoading,
    isFetching: current.isFetching || previous.isFetching,
    isError: current.isError,
    error: current.error,
    /** Período sem receita, pedido ou despesa: a tela mostra o vazio próprio. */
    isEmpty: !current.isLoading && isEmptyReport(report),

    attention,
    attentionLoading: pendingPayments.isLoading || register.isLoading,
    /** A faixa 1 some por completo quando não há nada a tratar. */
    hasAttention: attention.hasPendingPayments || attention.isRegisterOpen,

    result,
    leaks,
    trends,

    refetch: () => {
      current.refetch();
      previous.refetch();
      pendingPayments.refetch();
      register.refetch();
      cashSummary.refetch();
    },
  };
}
