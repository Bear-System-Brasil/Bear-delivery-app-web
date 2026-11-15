import { useAuthStore } from '@/stores/auth-store'
import { STORAGE_KEYS } from '@/utils/storage-manager'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Lista de quem favoritou sem login. */
export const VISITOR_KEY = '__visitante__'

interface FavoritesState {
  /** Favoritos da conta logada (ou do visitante). */
  favorites: string[]
  // Favoritos só existem no localStorage, que é do navegador e não da
  // conta. Uma lista por conta: B não vê os de A, e A reencontra os seus
  // ao voltar (LDMF-244).
  byUser: Record<string, string[]>
  ownerId: string | null
  addFavorite: (restaurantId: string) => void
  removeFavorite: (restaurantId: string) => void
  toggleFavorite: (restaurantId: string) => void
  isFavorite: (restaurantId: string) => boolean
  clearFavorites: () => void
  /** Troca para a lista de `userId` (null = visitante). */
  bindToUser: (userId: string | null) => void
}

const keyOf = (userId: string | null) => userId ?? VISITOR_KEY

/**
 * Store global para gerenciar restaurantes favoritos
 * Persiste os dados no localStorage
 */
export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => {
      // Grava na lista atual e na da conta dona dela
      const commit = (update: (favorites: string[]) => string[]) =>
        set((state) => {
          const favorites = update(state.favorites)
          return {
            favorites,
            byUser: { ...state.byUser, [keyOf(state.ownerId)]: favorites },
          }
        })

      return {
        favorites: [],
        byUser: {},
        ownerId: null,

        addFavorite: (restaurantId: string) =>
          commit((favorites) =>
            favorites.includes(restaurantId)
              ? favorites
              : [...favorites, restaurantId],
          ),

        removeFavorite: (restaurantId: string) =>
          commit((favorites) => favorites.filter((id) => id !== restaurantId)),

        toggleFavorite: (restaurantId: string) =>
          commit((favorites) =>
            favorites.includes(restaurantId)
              ? favorites.filter((id) => id !== restaurantId)
              : [...favorites, restaurantId],
          ),

        isFavorite: (restaurantId: string) =>
          get().favorites.includes(restaurantId),

        clearFavorites: () => commit(() => []),

        bindToUser: (userId) => {
          const byUser = { ...get().byUser }
          let favorites = byUser[keyOf(userId)] ?? []

          // Quem favoritou antes de logar continua com os favoritos depois
          // do login: a conta que entra adota a lista do visitante, que
          // esvazia - a próxima conta não herda
          const visitor = byUser[VISITOR_KEY] ?? []
          if (userId !== null && visitor.length > 0) {
            favorites = [
              ...favorites,
              ...visitor.filter((id) => !favorites.includes(id)),
            ]
            byUser[userId] = favorites
            delete byUser[VISITOR_KEY]
          }

          set({ ownerId: userId, favorites, byUser })
        },
      }
    },
    {
      name: STORAGE_KEYS.FAVORITES,
      version: 2,
      partialize: (state) => ({ byUser: state.byUser }),
      // v1 era uma lista só, sem dono. Fica com a conta logada agora; sem
      // ninguém logado não dá pra saber de quem é, e é descartada
      migrate: (persisted, version) => {
        if (version < 2) {
          const legacy = (persisted as { favorites?: unknown })?.favorites
          const userId = useAuthStore.getState().user?.id
          return {
            byUser:
              userId && Array.isArray(legacy) && legacy.length > 0
                ? { [userId]: legacy as string[] }
                : {},
          }
        }
        return persisted as { byUser: Record<string, string[]> }
      },
    },
  ),
)

// Mesmo gatilho do carrinho (LDMF-239): todo caminho que troca o usuário
// passa pelo auth-store. A chamada inicial monta a lista da conta do boot.
if (typeof window !== "undefined") {
  let boundUserId = useAuthStore.getState().user?.id ?? null;
  useFavoritesStore.getState().bindToUser(boundUserId);
  useAuthStore.subscribe((state) => {
    const userId = state.user?.id ?? null;
    if (userId === boundUserId) return;
    boundUserId = userId;
    useFavoritesStore.getState().bindToUser(userId);
  });
}
