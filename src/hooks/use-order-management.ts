import {
  type ColumnId,
  type CompanyOrder,
  getColumnForOrder,
  ORDER_POLL_INTERVAL,
} from '@/constants/order-management'
import { useSound } from '@/hooks/use-sound'
import { acknowledgeOrder, stopOrderAlerts } from '@/lib/order-alerts'
import { apiService, MAX_PAGE_LIMIT } from '@/services/api'
import { useAuthStore } from '@/stores'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface OrderColumns {
  new: CompanyOrder[]
  preparing: CompanyOrder[]
  ready: CompanyOrder[]
  completed: CompanyOrder[]
}

export interface StatusCounts {
  new: number
  preparing: number
  ready: number
  completed: number
  total: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook auxiliar — Timer de tempo decorrido
// ─────────────────────────────────────────────────────────────────────────────

export function useElapsedTimer(interval: number = 60_000) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), interval)
    return () => clearInterval(id)
  }, [interval])

  return tick
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook principal — useOrderManagement
// ─────────────────────────────────────────────────────────────────────────────

export const useOrderManagement = () => {
  const { isAuthenticated } = useAuthStore()
  const queryClient = useQueryClient()

  // Identidade sonora. O mute vive no localStorage: antes ele era estado local
  // e voltava a apitar a cada F5, mesmo depois de o restaurante desligar.
  const { play, stopLoop, muted, toggleMuted } = useSound('restaurant')
  const soundEnabled = !muted

  // UI state
  const [activeTab, setActiveTab] = useState<ColumnId>('new')
  const [selectedOrder, setSelectedOrderState] = useState<CompanyOrder | null>(null)
  const setSelectedOrder = useCallback((order: CompanyOrder | null) => {
    if (order) acknowledgeOrder(order.id)
    setSelectedOrderState(order)
  }, [])
  const [cancelTarget, setCancelTarget] = useState<CompanyOrder | null>(null)
  const [actionTarget, setActionTarget] = useState<CompanyOrder | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)

  // Timer tick para atualizar tempo decorrido nos cards
  useElapsedTimer(30_000)

  // ─── Fetch de pedidos da empresa ──────────────────────────────────────────

  const {
    data: ordersResponse,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['company-orders'],
    queryFn: async () => {
      // Kanban ao vivo: precisa ver TODOS os pedidos ativos de uma vez, não
      // dá pra esconder metade atrás de um "próxima página" numa tela que
      // atualiza sozinha a cada 15s. Sem paginação de verdade aqui - só o
      // limite máximo (100) pra não pedir a lista inteira sem limite.
      const response = await apiService.orders.getCompanyOrders({
        page: 1,
        limit: MAX_PAGE_LIMIT,
      })
      if (!response.success) {
        throw new Error(response.message || 'Erro ao carregar pedidos')
      }
      return response
    },
    refetchInterval: ORDER_POLL_INTERVAL,
    enabled: !!isAuthenticated,
    staleTime: 10_000,
  })

  const orders = useMemo<CompanyOrder[]>(() => {
    if (!ordersResponse?.success || !ordersResponse.data) return []
    return ordersResponse.data.data as CompanyOrder[]
  }, [ordersResponse])

  // ─── Agrupamento em colunas ────────────────────────────────────────────────

  const columns: OrderColumns = useMemo(() => {
    const grouped: OrderColumns = {
      new: [],
      preparing: [],
      ready: [],
      completed: [],
    }

    for (const order of orders) {
      const column = getColumnForOrder(order)
      if (column === 'canceled') {
        grouped.completed.push(order)
      } else {
        grouped[column].push(order)
      }
    }

    // Novos: mais recentes primeiro (urgência)
    grouped.new.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    // Em preparo: mais antigos primeiro (FIFO)
    grouped.preparing.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    // Prontos: mais antigos primeiro
    grouped.ready.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    // Concluídos: mais recentes primeiro
    grouped.completed.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return grouped
  }, [orders])

  // ─── Contadores ────────────────────────────────────────────────────────────

  const statusCounts: StatusCounts = useMemo(
    () => ({
      new: columns.new.length,
      preparing: columns.preparing.length,
      ready: columns.ready.length,
      completed: columns.completed.length,
      total: orders.length,
    }),
    [columns, orders],
  )

  // ─── Silenciamento ao esvaziar Novos ─────────────────────────────────────
  // O alerta sonoro inicial e repetições espaçadas (30s) são gerenciados
  // globalmente pelo NotificationsProvider/ManagementOrderWatcher (LDMF-329),
  // sem nenhum loop infinito a cada 2,8s.

  // ─── Controle de som ──────────────────────────────────────────────────────

  // Silenciar já para qualquer alerta em curso e persiste a preferência.
  const toggleSound = toggleMuted

  const stopAlert = useCallback(() => {
    stopOrderAlerts()
    stopLoop('new-order')
  }, [stopLoop])

  useEffect(() => {
    if (columns.new.length === 0) {
      stopAlert()
    }
  }, [columns.new.length, stopAlert])

  // ─── Mutation: Avançar status do pedido ───────────────────────────────────

  const updateStatusMutation = useMutation({
    mutationFn: ({ orderId, status }: { orderId: string; status: string }) =>
      apiService.orders.updateOrderStatus(orderId, status),
    onSuccess: (response) => {
      if (response.success) {
        queryClient.invalidateQueries({ queryKey: ['company-orders'] })
        play('success')
        toast.success('Status atualizado com sucesso')
      } else {
        toast.error(response.message || 'Erro ao atualizar status')
      }
    },
    onError: () => {
      toast.error('Erro de conexão ao atualizar status')
    },
  })

  // ─── Mutation: Cancelar pedido ─────────────────────────────────────────────

  const cancelMutation = useMutation({
    mutationFn: ({ orderId, reason }: { orderId: string; reason: string }) =>
      apiService.orders.cancelOrder(orderId, reason),
    onSuccess: (response) => {
      if (response.success) {
        queryClient.invalidateQueries({ queryKey: ['company-orders'] })
        play('error')
        toast.success('Pedido cancelado')
        setCancelTarget(null)
      } else {
        toast.error(response.message || 'Erro ao cancelar pedido')
      }
    },
    onError: () => {
      toast.error('Erro de conexão ao cancelar pedido')
    },
  })

  // ─── Ações ─────────────────────────────────────────────────────────────────

  const advanceOrder = useCallback(
    (orderId: string, nextStatus: string) => {
      acknowledgeOrder(orderId)
      // Só cala o alarme de vez se esse pedido era o único ainda em "Novos" -
      // dois pedidos podem chegar juntos tocando o mesmo loop, e avançar um
      // não pode silenciar o aviso do outro que continua sem nenhuma ação.
      const stillHasOtherNewOrders = columns.new.some((o) => o.id !== orderId)
      if (!stillHasOtherNewOrders) {
        stopAlert()
      }
      updateStatusMutation.mutate({ orderId, status: nextStatus })
      setActionTarget(null)
    },
    [columns.new, updateStatusMutation, stopAlert],
  )

  const cancelOrder = useCallback(
    (orderId: string, reason: string) => {
      acknowledgeOrder(orderId)
      cancelMutation.mutate({ orderId, reason })
    },
    [cancelMutation],
  )

  // O destravamento do áudio (política de autoplay do browser) é cuidado pelo
  // próprio soundManager, no primeiro toque em qualquer lugar do app.

  useEffect(() => {
    return () => {
      stopAlert()
    }
  }, [stopAlert])

  // ─── Retorno ───────────────────────────────────────────────────────────────

  return {
    // Data
    columns,
    statusCounts,
    isLoading,
    isError,
    orders,

    // UI state
    activeTab,
    setActiveTab,
    selectedOrder,
    setSelectedOrder,
    cancelTarget,
    setCancelTarget,
    actionTarget,
    setActionTarget,
    soundEnabled,
    showCompleted,
    setShowCompleted,

    // Actions
    advanceOrder,
    cancelOrder,
    toggleSound,
    stopAlert,
    refetch,

    // Mutation states
    isUpdating: updateStatusMutation.isPending,
    isCanceling: cancelMutation.isPending,
  }
}
