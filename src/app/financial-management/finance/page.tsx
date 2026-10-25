"use client";

import { AdminPageLayout } from "@/components/admin-page-layout";
import { ChangePaymentMethodDialog } from "@/components/change-payment-method-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { usePayment } from "@/hooks";
import { buildPaymentMethodUpdate } from "@/lib/payment-update";
import { cn } from "@/lib/utils";
import { Payment, PaymentMethod, PaymentStatus } from "@/services/api";
import { useAuthStore } from "@/stores";
import { formatCurrency, getCustomerDisplayName } from "@/utils";
import { isManagementRole } from "@/utils/role-helpers";
import { Check, DollarSign, Search, SlidersHorizontal, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";

const PAY_METHOD_OPTIONS: { value: PaymentMethod | "ALL"; label: string }[] = [
  { value: "ALL", label: "Todos os métodos" },
  { value: PaymentMethod.PIX, label: "PIX" },
  { value: PaymentMethod.CREDIT_CARD, label: "Cartão de Crédito" },
  { value: PaymentMethod.DEBIT_CARD, label: "Cartão de Débito" },
  { value: PaymentMethod.CASH, label: "Dinheiro" },
  { value: PaymentMethod.BANK_TRANSFER, label: "Transferência" },
];

const PAY_STATUS_OPTIONS: { value: PaymentStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "Todos os status" },
  { value: PaymentStatus.PENDING, label: "Pendente" },
  { value: PaymentStatus.COMPLETED, label: "Concluído" },
  { value: PaymentStatus.FAILED, label: "Falhado" },
  { value: PaymentStatus.CANCELLED, label: "Cancelado" },
  { value: PaymentStatus.REFUNDED, label: "Reembolsado" },
];

// Ordem fixa pra quebra por método ficar estável (só aparecem os presentes).
const METHOD_ORDER: PaymentMethod[] = [
  PaymentMethod.CASH,
  PaymentMethod.PIX,
  PaymentMethod.CREDIT_CARD,
  PaymentMethod.DEBIT_CARD,
  PaymentMethod.BANK_TRANSFER,
];

const STATUS_BADGE: Record<PaymentStatus, string> = {
  [PaymentStatus.COMPLETED]: "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400",
  [PaymentStatus.PENDING]: "bg-brand-50 dark:bg-brand-950/40 text-amber-700 dark:text-amber-400",
  [PaymentStatus.FAILED]: "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400",
  [PaymentStatus.CANCELLED]: "bg-muted text-muted-foreground",
  [PaymentStatus.REFUNDED]: "bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400",
};

// VALOR antes de STATUS (mock Painel 2): PEDIDO · CLIENTE · MÉTODO · DATA · VALOR · STATUS · AÇÃO.
const TABLE_GRID = "104px minmax(130px,1fr) 128px 100px 100px 92px 172px";

const headerCellClass =
  "text-[10px] font-extrabold tracking-[0.05em] text-muted-foreground";

const fieldClass =
  "h-9 w-full rounded-[9px] border border-border bg-card px-2.5 text-[12px] font-semibold text-foreground outline-none";

function formatDateShort(value?: string | Date) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const datePart = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });
  const timePart = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${datePart} ${timePart}`;
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-[5px] text-[11px] font-bold text-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function CompactButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "h-9 shrink-0 rounded-[9px] bg-muted px-4 text-xs font-bold text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
}

function RowActionButton({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "h-7 shrink-0 rounded-[7px] px-2.5 text-[10.5px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
}

function ChangeMethodLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 cursor-pointer text-[10.5px] font-bold text-brand-600 underline-offset-2 hover:underline dark:text-brand-400"
    >
      Alterar
    </button>
  );
}

export default function FinancePage() {
  const {
    payments,
    paymentsMeta,
    isLoading,
    fetchPaymentsByFilters,
    fetchPaymentsByMethod,
    fetchPaymentsByDateRange,
    approvePayment,
    rejectPayment,
    refundPayment,
    updatePayment,
    getPaymentMethodLabel,
    getPaymentStatusLabel,
    isPending,
    isCompleted,
    isFailed,
  } = usePayment();

  // Só a gerência altera forma de pagamento; `financial` vê Finanças, mas não
  // o botão. A restrição de verdade é do backend.
  const role = useAuthStore((state) => state.user?.role);
  const canManagePayments = isManagementRole(role);
  const [paymentToChange, setPaymentToChange] = useState<Payment | null>(null);
  const [isChangingMethod, setIsChangingMethod] = useState(false);

  const [filterMethod, setFilterMethod] = useState<PaymentMethod | "ALL">(
    "ALL",
  );
  const [filterStatus, setFilterStatus] = useState<PaymentStatus | "ALL">(
    "ALL",
  );
  const [searchOrderId, setSearchOrderId] = useState("");
  const [searchCustomerId, setSearchCustomerId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const PAGE_SIZE = 20;

  useEffect(() => {
    handleSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // targetPage: por padrão mantém a página atual (ex: reload após aprovar
  // um pagamento não deve chutar o usuário de volta pra página 1).
  const handleSearch = async (targetPage: number = page) => {
    setPage(targetPage);
    const params = { page: targetPage, limit: PAGE_SIZE };

    if (dateFrom && dateTo) {
      await fetchPaymentsByDateRange(
        {
          startDate: new Date(dateFrom).toISOString(),
          endDate: new Date(dateTo).toISOString(),
          customerId: searchCustomerId || undefined,
        },
        params,
      );
    } else if (filterMethod !== "ALL") {
      await fetchPaymentsByMethod(filterMethod, params);
    } else {
      const filters: { orderId?: string; customerId?: string } = {};
      if (searchOrderId) filters.orderId = searchOrderId;
      if (searchCustomerId) filters.customerId = searchCustomerId;
      await fetchPaymentsByFilters(filters, params);
    }
  };

  // Nova busca/filtro sempre volta pra página 1 (ver pagination.md).
  const handleNewSearch = () => handleSearch(1);

  const handleClearFilters = () => {
    setFilterMethod("ALL");
    setFilterStatus("ALL");
    setSearchOrderId("");
    setSearchCustomerId("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
    fetchPaymentsByFilters({}, { page: 1, limit: PAGE_SIZE });
  };

  const handleApprove = async (payment: Payment) => {
    await approvePayment(payment.id, `TXN-${Date.now()}`);
    handleSearch();
  };

  const handleReject = async (payment: Payment) => {
    await rejectPayment(payment.id);
    handleSearch();
  };

  const handleRefund = async (payment: Payment) => {
    await refundPayment(payment.id);
    handleSearch();
  };

  // Forma só muda em pagamento pendente. Ao aprovar, o backend lança a venda
  // no caixa com a forma daquele momento (financial.md); trocar depois deixa
  // o caixa com a forma antiga e os totais por forma errados.
  const canChangeMethod = (payment: Payment) =>
    canManagePayments && isPending(payment);

  const handleChangeMethod = async (method: PaymentMethod) => {
    if (!paymentToChange) return false;
    setIsChangingMethod(true);
    try {
      const updated = await updatePayment(
        paymentToChange.id,
        buildPaymentMethodUpdate(paymentToChange, method),
      );
      if (!updated) return false;
      handleSearch();
      return true;
    } finally {
      setIsChangingMethod(false);
    }
  };

  const filteredPayments = useMemo(
    () =>
      filterStatus === "ALL"
        ? payments
        : payments.filter((p) => p.status === filterStatus),
    [payments, filterStatus],
  );

  // Resumo do topo: total + quebra por método, calculado no client a partir
  // da lista já carregada (sem rota/campo novo). Reflete o que está na tabela.
  const summary = useMemo(() => {
    const totalAmount = filteredPayments.reduce((sum, p) => sum + p.amount, 0);
    const byMethod = new Map<PaymentMethod, { amount: number; count: number }>();
    for (const p of filteredPayments) {
      const entry = byMethod.get(p.paymentMethod) ?? { amount: 0, count: 0 };
      entry.amount += p.amount;
      entry.count += 1;
      byMethod.set(p.paymentMethod, entry);
    }
    const breakdown = METHOD_ORDER.filter((m) => byMethod.has(m)).map((m) => ({
      method: m,
      ...byMethod.get(m)!,
    }));
    return { totalAmount, count: filteredPayments.length, breakdown };
  }, [filteredPayments]);

  // Quantos filtros avançados (os do modal) estão ativos — vira badge no botão.
  const advancedFilterCount =
    (filterStatus !== "ALL" ? 1 : 0) +
    (searchCustomerId ? 1 : 0) +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  const hasAnyFilter =
    advancedFilterCount > 0 || filterMethod !== "ALL" || searchOrderId !== "";

  const applyAdvancedFilters = () => {
    setFiltersOpen(false);
    handleNewSearch();
  };

  const clearFromModal = () => {
    setFiltersOpen(false);
    handleClearFilters();
  };

  return (
    <AdminPageLayout
      title="Gestão de Pagamentos"
      icon={DollarSign}
      mainClassName="p-4 pb-20 sm:p-6 md:pb-10 lg:pl-64 lg:pr-8"
    >
      <div className="mx-auto max-w-7xl">
        {/* Resumo: total em pagamentos + quebra por método */}
        <section className="mb-3.5 rounded-[13px] border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11.5px] font-semibold text-muted-foreground">
                Total em pagamentos
              </div>
              <div className="mt-1 text-[26px] font-extrabold leading-none text-foreground">
                {formatCurrency(summary.totalAmount)}
              </div>
              <div className="mt-1 text-[11px] font-semibold text-muted-foreground">
                {summary.count} pagamento{summary.count === 1 ? "" : "s"} na lista
              </div>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400">
              <DollarSign className="h-5 w-5" />
            </span>
          </div>

          {summary.breakdown.length > 0 && (
            <div className="mt-3.5 flex flex-wrap gap-2">
              {summary.breakdown.map((b) => (
                <div
                  key={b.method}
                  className="rounded-[10px] border border-border bg-muted px-3 py-2"
                >
                  <div className="text-[10.5px] font-bold text-muted-foreground">
                    {getPaymentMethodLabel(b.method)}
                  </div>
                  <div className="mt-0.5 text-[13.5px] font-extrabold text-foreground">
                    {formatCurrency(b.amount)}
                  </div>
                  <div className="text-[10px] font-semibold text-muted-foreground">
                    {b.count} pagamento{b.count === 1 ? "" : "s"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Barra de filtros enxuta: busca + método + período + botão Filtros */}
        <div className="mb-3.5 flex flex-col gap-2.5 rounded-[13px] border border-border bg-card p-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="Buscar por pedido"
              value={searchOrderId}
              onChange={(e) => setSearchOrderId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleNewSearch();
              }}
              className={cn(fieldClass, "pl-8")}
            />
          </div>

          <select
            value={filterMethod}
            onChange={(e) => {
              setFilterMethod(e.target.value as PaymentMethod | "ALL");
            }}
            className={cn(fieldClass, "lg:w-[180px]")}
            aria-label="Método de pagamento"
          >
            {PAY_METHOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFiltersOpen(true)}
              className="relative flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] border border-border bg-card px-3.5 text-xs font-bold text-foreground transition-colors hover:bg-muted"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Filtros
              {advancedFilterCount > 0 && (
                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-extrabold text-white">
                  {advancedFilterCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleNewSearch}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-[9px] bg-zinc-900 px-4 text-xs font-bold text-white transition-colors hover:bg-zinc-800"
            >
              <Search className="h-3.5 w-3.5" />
              Buscar
            </button>

            {hasAnyFilter && (
              <CompactButton onClick={handleClearFilters}>Limpar</CompactButton>
            )}
          </div>
        </div>

        {/* Lista de pagamentos */}
        <div className="overflow-hidden rounded-[13px] border border-border bg-card">
          <div className="border-b border-border p-4 text-[13px] font-extrabold text-foreground">
            Pagamentos encontrados ({filteredPayments.length})
          </div>

          {isLoading ? (
            <div className="space-y-2 p-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full rounded-[9px]" />
              ))}
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="py-9 text-center">
              <div className="text-2xl">💳</div>
              <div className="mt-1.5 text-[13px] font-bold text-foreground">
                Nenhum pagamento encontrado
              </div>
              <div className="mt-0.5 text-[11.5px] text-muted-foreground">
                Tente ajustar os filtros de busca
              </div>
            </div>
          ) : (
            <>
              {/* Mobile: lista em cards */}
              <div className="divide-y divide-border md:hidden">
                {filteredPayments.map((payment) => (
                  <div key={payment.id} className="p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-[12.5px] font-extrabold text-foreground">
                          #{payment.orderId.slice(0, 8)}
                        </div>
                        <div className="truncate text-[10.5px] font-semibold text-muted-foreground">
                          {payment.transaction || "—"}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "w-fit shrink-0 rounded-md px-2 py-0.5 text-[10.5px] font-extrabold",
                          STATUS_BADGE[payment.status],
                        )}
                      >
                        {getPaymentStatusLabel(payment.status)}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 text-[11.5px] font-semibold text-muted-foreground">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate">
                          {getPaymentMethodLabel(payment.paymentMethod)}
                        </span>
                        {canChangeMethod(payment) && (
                          <ChangeMethodLink onClick={() => setPaymentToChange(payment)} />
                        )}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {formatDateShort(payment.date || payment.created_at)}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2">
                      <span
                        className="truncate text-[11.5px] font-semibold text-muted-foreground"
                        title={payment.customerId}
                      >
                        {getCustomerDisplayName(payment.customer)}
                      </span>
                      <span className="shrink-0 text-[13px] font-extrabold text-foreground">
                        {formatCurrency(payment.amount)}
                      </span>
                    </div>

                    {(isPending(payment) ||
                      isFailed(payment) ||
                      isCompleted(payment)) && (
                      <div className="mt-2.5 flex gap-1.5">
                        {isPending(payment) && (
                          <>
                            <RowActionButton
                              onClick={() => handleApprove(payment)}
                              className="flex flex-1 items-center justify-center gap-1 bg-zinc-900 text-white hover:bg-zinc-800"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Confirmar
                            </RowActionButton>
                            <RowActionButton
                              onClick={() => handleReject(payment)}
                              aria-label="Rejeitar"
                              className="flex items-center justify-center gap-1 bg-red-50 px-3 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400"
                            >
                              <X className="h-3.5 w-3.5" />
                              Rejeitar
                            </RowActionButton>
                          </>
                        )}
                        {isFailed(payment) && (
                          <RowActionButton
                            onClick={() => handleApprove(payment)}
                            className="flex-1 bg-zinc-900 text-white hover:bg-zinc-800"
                          >
                            Reprocessar
                          </RowActionButton>
                        )}
                        {isCompleted(payment) && (
                          <RowActionButton
                            onClick={() => handleRefund(payment)}
                            className="flex-1 border border-border bg-card text-foreground hover:bg-muted"
                          >
                            Reembolsar
                          </RowActionButton>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Desktop/tablet: tabela */}
              <div className="hidden overflow-x-auto md:block">
                <div className="min-w-[900px]">
                  <div
                    className="grid items-center gap-2.5 border-b border-border bg-muted px-4 py-2.5"
                    style={{ gridTemplateColumns: TABLE_GRID }}
                  >
                    <span className={headerCellClass}>PEDIDO / TID</span>
                    <span className={headerCellClass}>CLIENTE</span>
                    <span className={headerCellClass}>MÉTODO</span>
                    <span className={headerCellClass}>DATA</span>
                    <span className={cn(headerCellClass, "text-right")}>
                      VALOR
                    </span>
                    <span className={headerCellClass}>STATUS</span>
                    <span className={cn(headerCellClass, "text-right")}>
                      AÇÃO
                    </span>
                  </div>

                  {filteredPayments.map((payment) => (
                    <div
                      key={payment.id}
                      className="grid items-center gap-2.5 border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-muted"
                      style={{ gridTemplateColumns: TABLE_GRID }}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-extrabold text-foreground">
                          #{payment.orderId.slice(0, 8)}
                        </div>
                        <div className="truncate text-[10px] font-semibold text-muted-foreground">
                          {payment.transaction || "—"}
                        </div>
                      </div>

                      <span
                        className="truncate text-[12.5px] font-semibold text-foreground"
                        title={payment.customerId}
                      >
                        {getCustomerDisplayName(payment.customer)}
                      </span>

                      <div className="min-w-0">
                        <div className="truncate text-[11.5px] font-semibold text-foreground">
                          {getPaymentMethodLabel(payment.paymentMethod)}
                        </div>
                        {canChangeMethod(payment) && (
                          <ChangeMethodLink onClick={() => setPaymentToChange(payment)} />
                        )}
                      </div>

                      <span className="text-[11px] font-semibold text-muted-foreground">
                        {formatDateShort(payment.date || payment.created_at)}
                      </span>

                      <span className="text-right text-[13px] font-extrabold text-foreground">
                        {formatCurrency(payment.amount)}
                      </span>

                      <span
                        className={cn(
                          "w-fit rounded-md px-2 py-0.5 text-[10.5px] font-extrabold",
                          STATUS_BADGE[payment.status],
                        )}
                      >
                        {getPaymentStatusLabel(payment.status)}
                      </span>

                      <div className="flex justify-end gap-1.5">
                        {isPending(payment) && (
                          <>
                            <RowActionButton
                              onClick={() => handleApprove(payment)}
                              className="flex items-center justify-center gap-1 bg-zinc-900 text-white hover:bg-zinc-800"
                            >
                              <Check className="h-3.5 w-3.5" />
                              Confirmar
                            </RowActionButton>
                            <RowActionButton
                              onClick={() => handleReject(payment)}
                              aria-label="Rejeitar"
                              className="flex items-center justify-center bg-red-50 px-2 text-red-600 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-400"
                            >
                              <X className="h-3.5 w-3.5" />
                            </RowActionButton>
                          </>
                        )}
                        {isFailed(payment) && (
                          <RowActionButton
                            onClick={() => handleApprove(payment)}
                            className="bg-zinc-900 text-white hover:bg-zinc-800"
                          >
                            Reprocessar
                          </RowActionButton>
                        )}
                        {isCompleted(payment) && (
                          <RowActionButton
                            onClick={() => handleRefund(payment)}
                            className="border border-border bg-card text-foreground hover:bg-muted"
                          >
                            Reembolsar
                          </RowActionButton>
                        )}
                        {!isPending(payment) &&
                          !isFailed(payment) &&
                          !isCompleted(payment) && (
                            <span className="text-[11px] text-muted-foreground">
                              —
                            </span>
                          )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {paymentsMeta && paymentsMeta.totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
              <span className="text-[11.5px] font-semibold text-muted-foreground">
                Página {paymentsMeta.page} de {paymentsMeta.totalPages} (
                {paymentsMeta.total} pagamentos)
              </span>
              <div className="flex gap-1.5">
                <CompactButton
                  onClick={() => handleSearch(page - 1)}
                  disabled={page <= 1 || isLoading}
                >
                  Anterior
                </CompactButton>
                <CompactButton
                  onClick={() => handleSearch(page + 1)}
                  disabled={page >= paymentsMeta.totalPages || isLoading}
                >
                  Próxima
                </CompactButton>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de filtros avançados (status, cliente, período) */}
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Filtros</DialogTitle>
            <DialogDescription>
              Refine a busca de pagamentos por status, cliente e período.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FilterField label="Status">
              <select
                value={filterStatus}
                onChange={(e) =>
                  setFilterStatus(e.target.value as PaymentStatus | "ALL")
                }
                className={fieldClass}
              >
                {PAY_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField label="ID do Cliente">
              <input
                placeholder="Buscar por cliente"
                value={searchCustomerId}
                onChange={(e) => setSearchCustomerId(e.target.value)}
                className={fieldClass}
              />
            </FilterField>

            <FilterField label="Data início">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className={fieldClass}
              />
            </FilterField>

            <FilterField label="Até">
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className={fieldClass}
              />
            </FilterField>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={clearFromModal}>
              Limpar
            </Button>
            <Button type="button" onClick={applyAdvancedFilters}>
              Aplicar filtros
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ChangePaymentMethodDialog
        open={paymentToChange !== null}
        onClose={() => setPaymentToChange(null)}
        currentMethod={paymentToChange?.paymentMethod}
        onConfirm={handleChangeMethod}
        title="Alterar forma de pagamento"
        description={
          paymentToChange
            ? `Pedido #${paymentToChange.orderId.slice(0, 8)} · ${formatCurrency(paymentToChange.amount)}`
            : ""
        }
        confirmLabel="Salvar forma"
        isLoading={isChangingMethod}
      />
    </AdminPageLayout>
  );
}
