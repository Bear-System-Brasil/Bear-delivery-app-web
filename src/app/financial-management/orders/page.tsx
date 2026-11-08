"use client"

import { AdminPageLayout } from "@/components/admin-page-layout"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { apiService, MAX_PAGE_LIMIT } from "@/services/api"
import { Order } from "@/services/api"
import { formatCurrency, getCustomerDisplayName } from "@/utils"
import { useAuthStore } from "@/stores"
import { useQuery } from "@tanstack/react-query"
import { ClipboardList } from "lucide-react"
import { useMemo, useState } from "react"

const STATUS_LABELS: Record<string, string> = {
  CART: "Carrinho",
  ORDERED: "Recebido",
  AWAITING_PAYMENT: "Aguard. Pagamento",
  IN_PRODUCTION: "Em Produção",
  READY_FOR_PICKUP: "Pronto p/ Retirada",
  COMPLETED: "Concluído",
  CANCELED: "Cancelado",
  ABANDONED: "Abandonado",
}

const STATUS_COLORS: Record<string, string> = {
  CART: "bg-muted text-foreground",
  ORDERED: "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-400",
  AWAITING_PAYMENT: "bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-400",
  IN_PRODUCTION: "bg-brand-100 dark:bg-brand-900 text-brand-700 dark:text-brand-400",
  READY_FOR_PICKUP: "bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-400",
  COMPLETED: "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-400",
  CANCELED: "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-400",
  ABANDONED: "bg-muted text-muted-foreground",
}

type FilterStatus = "ALL" | Order["status"]

const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
  { value: "ALL", label: "Todos os status" },
  { value: "ORDERED", label: "Recebido" },
  { value: "AWAITING_PAYMENT", label: "Aguard. Pagamento" },
  { value: "IN_PRODUCTION", label: "Em Produção" },
  { value: "READY_FOR_PICKUP", label: "Pronto p/ Retirada" },
  { value: "COMPLETED", label: "Concluído" },
  { value: "CANCELED", label: "Cancelado" },
]

export default function OrdersPage() {
  const { isAuthenticated } = useAuthStore()
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("ALL")

  const { data: orders = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["financial", "orders"],
    queryFn: async () => {
      // Filtro de status e cards de resumo dependem da base inteira -
      // percorre todas as páginas (limite máximo por chamada) em vez de um
      // fetch único sem limite como antes.
      const allOrders: Order[] = []
      let page = 1
      while (true) {
        const response = await apiService.orders.getCompanyOrders({
          page,
          limit: MAX_PAGE_LIMIT,
        })
        if (!response.success || !response.data) break
        allOrders.push(...response.data.data)
        if (page >= response.data.meta.totalPages) break
        page += 1
      }
      return allOrders
    },
    enabled: !!isAuthenticated,
    staleTime: 30_000,
    refetchInterval: 30_000,
  })

  const filtered = useMemo(() => {
    if (filterStatus === "ALL") return orders
    return orders.filter((o) => o.status === filterStatus)
  }, [orders, filterStatus])

  const counts = useMemo(() => ({
    total: orders.length,
    pending: orders.filter((o) =>
      ["ORDERED", "AWAITING_PAYMENT", "IN_PRODUCTION", "READY_FOR_PICKUP"].includes(o.status)
    ).length,
    completed: orders.filter((o) => o.status === "COMPLETED").length,
    canceled: orders.filter((o) => o.status === "CANCELED").length,
  }), [orders])

  return (
    <AdminPageLayout
      title="Pedidos"
      icon={ClipboardList}
      mainClassName="p-4 pb-20 sm:p-6 md:pb-10 lg:pl-64 lg:pr-8"
      action={{
        label: "Atualizar",
        busyLabel: "Atualizando...",
        onClick: () => refetch(),
        busy: isFetching,
      }}
    >
      <div className="max-w-7xl mx-auto space-y-6">

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Total", value: counts.total, color: "text-foreground" },
              { label: "Em andamento", value: counts.pending, color: "text-brand-600 dark:text-brand-400" },
              { label: "Concluídos", value: counts.completed, color: "text-green-600 dark:text-green-400" },
              { label: "Cancelados", value: counts.canceled, color: "text-red-600 dark:text-red-400" },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-card rounded-xl border border-border p-4">
                <p className="text-xs text-muted-foreground mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Filter */}
          <div className="flex flex-wrap items-center gap-3">
            <Select
              value={filterStatus}
              onValueChange={(v) => setFilterStatus(v as FilterStatus)}
            >
              <SelectTrigger className="w-full rounded-xl sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FILTER_OPTIONS.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              {filtered.length} pedido{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Table */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {isLoading ? (
              <div className="p-4 space-y-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                <ClipboardList className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p className="font-medium">Nenhum pedido encontrado</p>
                <p className="text-sm mt-1">Ajuste o filtro para ver outros pedidos</p>
              </div>
            ) : (
              <>
                {/* Mobile: lista em cards */}
                <div className="divide-y divide-border md:hidden">
                  {filtered.map((order) => (
                    <div key={order.id} className="p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-muted-foreground">
                            {order.id.slice(0, 8)}…
                          </p>
                          <p
                            className="mt-1 truncate text-sm font-semibold text-foreground"
                            title={order.customerId}
                          >
                            {getCustomerDisplayName(order.customer)}
                          </p>
                        </div>
                        <Badge
                          className={`shrink-0 text-xs ${STATUS_COLORS[order.status] ?? "bg-muted text-foreground"}`}
                        >
                          {STATUS_LABELS[order.status] ?? order.status}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">
                          {new Date(order.created_at).toLocaleString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="text-sm font-semibold">
                          {formatCurrency(order.totalValue)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop/tablet: tabela */}
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full text-sm">
                    <thead className="bg-muted border-b border-border">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          ID
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Data
                        </th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Cliente
                        </th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Total
                        </th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filtered.map((order) => (
                        <tr key={order.id} className="hover:bg-muted transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                            {order.id.slice(0, 8)}…
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {new Date(order.created_at).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td
                            className="px-4 py-3 font-medium text-foreground"
                            title={order.customerId}
                          >
                            {getCustomerDisplayName(order.customer)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold">
                            {formatCurrency(order.totalValue)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge
                              className={`text-xs ${STATUS_COLORS[order.status] ?? "bg-muted text-foreground"}`}
                            >
                              {STATUS_LABELS[order.status] ?? order.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
    </AdminPageLayout>
  )
}
