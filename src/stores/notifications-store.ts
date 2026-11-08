/**
 * =============================================================================
 * NOTIFICATIONS STORE - CENTRAL DE NOTIFICAÇÕES
 * =============================================================================
 *
 * Lista de notificações do sino global (cliente e gestão). Persiste em
 * localStorage para sobreviver a um refresh, mas é só o feed visual - quem
 * decide SE algo vira notificação é `src/lib/notify.ts`.
 */

import { useAuthStore } from '@/stores/auth-store'
import { STORAGE_KEYS } from '@/utils/storage-manager'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type NotificationAudience = 'customer' | 'management'

export interface AppNotification {
  id: string
  audience: NotificationAudience
  title: string
  body: string
  /** Rota para onde o clique na notificação deve levar. */
  href?: string
  /**
   * Pedido novo que gerou a notificação. Abrir a notificação conta como ver
   * o pedido e para o lembrete sonoro dele (LDMF-452).
   */
  orderId?: string
  createdAt: string
  read: boolean
}

/** Feed curto de propósito: isso é um sino, não um histórico de pedidos. */
const MAX_NOTIFICATIONS = 50

/** Feed de quem está sem login. */
export const VISITOR_KEY = '__visitante__'

const keyOf = (userId: string | null) => userId ?? VISITOR_KEY

interface NotificationsState {
  /** Feed da conta logada (ou do visitante). */
  items: AppNotification[]
  // O feed só existe no localStorage, que é do navegador e não da conta,
  // e leva título e link dos pedidos. Um feed por conta: B não vê o de A, e
  // A reencontra o seu ao voltar (LDMF-244).
  byUser: Record<string, AppNotification[]>
  ownerId: string | null
  addNotification: (
    notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'>,
  ) => void
  markAsRead: (id: string) => void
  markAllAsRead: (audience?: NotificationAudience) => void
  clearAll: (audience?: NotificationAudience) => void
  /** Troca para o feed de `userId` (null = visitante). */
  bindToUser: (userId: string | null) => void
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, get) => {
      // Grava no feed atual e no da conta dona dele
      const commit = (
        update: (items: AppNotification[]) => AppNotification[],
      ) =>
        set((state) => {
          const items = update(state.items)
          return {
            items,
            byUser: { ...state.byUser, [keyOf(state.ownerId)]: items },
          }
        })

      return {
        items: [],
        byUser: {},
        ownerId: null,

        addNotification: (notification) =>
          commit((items) =>
            [
              {
                ...notification,
                id:
                  typeof crypto !== 'undefined' && crypto.randomUUID
                    ? crypto.randomUUID()
                    : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
                createdAt: new Date().toISOString(),
                read: false,
              },
              ...items,
            ].slice(0, MAX_NOTIFICATIONS),
          ),

        markAsRead: (id) =>
          commit((items) =>
            items.map((item) =>
              item.id === id ? { ...item, read: true } : item,
            ),
          ),

        markAllAsRead: (audience) =>
          commit((items) =>
            items.map((item) =>
              !audience || item.audience === audience
                ? { ...item, read: true }
                : item,
            ),
          ),

        clearAll: (audience) =>
          commit((items) =>
            audience ? items.filter((item) => item.audience !== audience) : [],
          ),

        bindToUser: (userId) =>
          set({ ownerId: userId, items: get().byUser[keyOf(userId)] ?? [] }),
      }
    },
    {
      name: STORAGE_KEYS.NOTIFICATIONS,
      version: 1,
      partialize: (state) => ({ byUser: state.byUser }),
      // v0 era um feed só, sem dono. Fica com a conta logada agora; sem
      // ninguém logado não dá pra saber de quem é, e é descartado
      migrate: (persisted, version) => {
        if (version < 1) {
          const legacy = (persisted as { items?: unknown })?.items
          const userId = useAuthStore.getState().user?.id
          return {
            byUser:
              userId && Array.isArray(legacy) && legacy.length > 0
                ? { [userId]: legacy as AppNotification[] }
                : {},
          }
        }
        return persisted as { byUser: Record<string, AppNotification[]> }
      },
    },
  ),
)

// Mesmo gatilho do carrinho (LDMF-239): todo caminho que troca o usuário
// passa pelo auth-store. A chamada inicial monta o feed da conta do boot.
let boundUserId = useAuthStore.getState().user?.id ?? null
useNotificationsStore.getState().bindToUser(boundUserId)
useAuthStore.subscribe((state) => {
  const userId = state.user?.id ?? null
  if (userId === boundUserId) return
  boundUserId = userId
  useNotificationsStore.getState().bindToUser(userId)
})
