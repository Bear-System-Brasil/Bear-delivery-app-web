/**
 * =============================================================================
 * CART STORE - GERENCIAMENTO DE ESTADO DO CARRINHO
 * =============================================================================
 *
 * Store global do carrinho de compras usando Zustand.
 *
 * FEATURES:
 * - Sincronização com backend Redis
 * - Validação: itens de apenas UM restaurante por vez
 * - Estado temporário para UI
 * - Persist apenas orderId para recuperar carrinhos abandonados
 *
 * IMPORTANTE:
 * - O carrinho é gerenciado no BACKEND (Redis)
 * - Este store mantém apenas estado UI temporário
 * - A fonte da verdade é sempre o backend
 * - Use use-cart-actions.ts para operações de carrinho
 *
 * Uso:
 * ```typescript
 * const { items, restaurant, orderId } = useCartStore()
 * ```
 */

import { useAuthStore } from "@/stores/auth-store";
import { STORAGE_KEYS } from "@/utils/storage-manager";
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export interface CartItem {
  // Identifica a LINHA do carrinho (produto + combinação exata de tamanho/
  // complementos escolhida) - não o produto em si. Duas linhas do mesmo
  // prato com tamanhos diferentes têm `id`s diferentes, então aparecem
  // separadas e cada uma soma sua própria quantidade.
  id: string;
  // Id real do produto no backend - usado nas chamadas de add/remove/
  // atualizar quantidade, que só entendem productId (não a linha).
  productId: string;
  name: string;
  price: number;
  quantity: number;
  imageUrl?: string;
  restaurantId: string;
  restaurantName: string;
  customizations?: Record<string, unknown>;
  variationLabel?: string;
  addOnLabels?: string[];
  variations?: { productVariationId: string }[];
  addOns?: { productAddOnsId: string; quantity: number }[];
}

export interface Restaurant {
  id: string;
  name: string;
  rating?: number;
  time?: string;
  address?: string;
  deliveryFee?: number;
}

/**
 * Cupons de demonstração (sem validação de backend) - existem só pra dar
 * feedback de UI. `appliedPromo` fica no store (não em estado local da
 * página /cart) pra sobreviver à navegação até o checkout, que precisa
 * cobrar o mesmo total mostrado no carrinho.
 */
export const VALID_PROMO_CODES = ["PRIMEIRA20", "FRETE10"] as const;
export type PromoCode = (typeof VALID_PROMO_CODES)[number];

export function isValidPromoCode(code: string): code is PromoCode {
  return (VALID_PROMO_CODES as readonly string[]).includes(code);
}

export function getPromoDiscount(
  promo: string | null,
  subtotal: number,
): number {
  return promo === "PRIMEIRA20" ? subtotal * 0.2 : 0;
}

export function getDeliveryDiscount(
  promo: string | null,
  deliveryFee: number,
): number {
  return promo === "FRETE10" ? Math.min(deliveryFee, 10) : 0;
}

interface CartState {
  items: CartItem[];
  restaurant: Restaurant | null;
  isOpen: boolean;
  orderId: string | null; // ID do pedido no backend (carrinho Redis)
  // Conta dona do carrinho. O orderId fica no localStorage, que é do
  // navegador e não da conta - sem saber de quem ele é, a próxima conta a
  // entrar reusava o carrinho da anterior (LDMF-239).
  ownerId: string | null;
  isLoading: boolean;
  lastSynced: number | null;
  appliedPromo: string | null;

  // Computed - agora como funções
  getTotalItems: () => number;
  /** @deprecated use `getSubtotal` - mantido só pra não quebrar callers existentes. */
  getTotalPrice: () => number;

  // Actions - APENAS para atualizar estado local
  setItems: (items: CartItem[]) => void;
  setRestaurant: (restaurant: Restaurant | null) => void;
  setOrderId: (orderId: string | null) => void;
  setLoading: (loading: boolean) => void;
  setAppliedPromo: (promo: string | null) => void;
  clearCart: () => void;
  toggleCart: () => void;
  openCart: () => void;
  closeCart: () => void;
  getSubtotal: () => number;
  getTotal: (deliveryFee?: number) => number;
  markSynced: () => void;
  /** Descarta o carrinho se ele não for de `userId` (null = deslogado). */
  bindToUser: (userId: string | null) => void;
}

const emptyCart = {
  items: [],
  orderId: null,
  restaurant: null,
  lastSynced: null,
  appliedPromo: null,
};

export const useCartStore = create<CartState>()(
  devtools(
    persist(
      (set, get) => ({
        items: [],
        restaurant: null,
        isOpen: false,
        orderId: null,
        ownerId: null,
        isLoading: false,
        lastSynced: null,
        appliedPromo: null,

        getTotalItems: () => {
          return get().items.reduce((total, item) => total + item.quantity, 0);
        },

        getTotalPrice: () => get().getSubtotal(),

        getSubtotal: () => {
          return get().items.reduce(
            (total, item) => total + item.price * item.quantity,
            0,
          );
        },

        getTotal: (deliveryFee = 0) => {
          const subtotal = get().getSubtotal();
          return subtotal + deliveryFee;
        },

        setItems: (items) => {
          const merged = items.reduce<CartItem[]>((acc, item) => {
            const existingIndex = acc.findIndex((i) => i.id === item.id);
            if (existingIndex >= 0) {
              acc[existingIndex] = {
                ...acc[existingIndex],
                quantity: acc[existingIndex].quantity + item.quantity,
              };
            } else {
              acc.push(item);
            }
            return acc;
          }, []);
          set({ items: merged }, false, "cart/setItems");
        },

        setRestaurant: (restaurant) =>
          set({ restaurant }, false, "cart/setRestaurant"),

        setOrderId: (orderId) => set({ orderId }, false, "cart/setOrderId"),

        setLoading: (isLoading) => set({ isLoading }, false, "cart/setLoading"),

        setAppliedPromo: (appliedPromo) =>
          set({ appliedPromo }, false, "cart/setAppliedPromo"),

        markSynced: () =>
          set({ lastSynced: Date.now() }, false, "cart/markSynced"),

        clearCart: () => set(emptyCart, false, "cart/clearCart"),

        bindToUser: (userId) => {
          if (get().ownerId === userId) return;
          set(
            { ...emptyCart, isOpen: false, ownerId: userId },
            false,
            "cart/bindToUser",
          );
        },

        toggleCart: () =>
          set((state) => ({ isOpen: !state.isOpen }), false, "cart/toggleCart"),

        openCart: () => set({ isOpen: true }, false, "cart/openCart"),

        closeCart: () => set({ isOpen: false }, false, "cart/closeCart"),
      }),
      {
        name: STORAGE_KEYS.CART_ORDER_ID,
        // Persistir apenas orderId (e de quem ele é) para recuperar
        // carrinhos abandonados
        partialize: (state) => ({
          orderId: state.orderId,
          ownerId: state.ownerId,
        }),
      },
    ),
    { name: "cart-store", enabled: process.env.NODE_ENV !== "production" },
  ),
);

// O carrinho segue a conta logada. Qualquer caminho que troque o usuário -
// logout manual, 401 da API, sessão expirada no boot, login de outra conta -
// passa pelo auth-store, então escutar aqui cobre todos sem depender de
// cada um lembrar de limpar o carrinho. A chamada inicial cobre o boot:
// orderId persistido de uma conta com outra já logada (ou orderId antigo,
// gravado antes de existir `ownerId`). Descartar o orderId da própria conta
// não perde o carrinho - o sync do useCartActions recupera pelo `cart:<id>`.
if (typeof window !== "undefined") {
  useCartStore.getState().bindToUser(useAuthStore.getState().user?.id ?? null);
  useAuthStore.subscribe((state) => {
    useCartStore.getState().bindToUser(state.user?.id ?? null);
  });
}
