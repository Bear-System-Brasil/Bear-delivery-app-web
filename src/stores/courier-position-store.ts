import { create } from "zustand";
import { useAuthStore } from "@/stores/auth-store";

import type { Coords } from "@/types/restaurant";

/**
 * De onde veio a posição do entregador.
 *
 * - `tracking`: o `watchPosition` que o socket de rastreamento já mantém
 *   ligado enquanto há entrega PICKED_UP. Sai de graça - o navegador já está
 *   medindo, então aceitar outra corrida no meio da rua não custa GPS novo.
 * - `gps`: leitura pontual, pedida na hora de aceitar.
 * - `manual`: o entregador digitou onde está e o endereço foi geocodificado
 *   (Nominatim, sem a busca de reserva por cidade - ver LDMF-314).
 */
export type CourierPositionSource = "tracking" | "gps" | "manual";

export type CourierPosition = {
  coords: Coords;
  source: CourierPositionSource;
  /** Quando foi medida/informada, em ms. */
  at: number;
  /** Texto que o entregador digitou, quando `source` é `manual`. */
  label?: string;
};

/**
 * Depois disso a posição não serve mais pro cálculo de frete - o entregador
 * se move. Cinco minutos cobre o tempo entre ver a corrida e aceitar, e
 * renovar é barato: só vira incômodo pro entregador se o GPS também falhar.
 */
export const POSITION_MAX_AGE_MS = 5 * 60 * 1000;

type CourierPositionState = {
  position: CourierPosition | null;
  setPosition: (
    coords: Coords,
    source: CourierPositionSource,
    label?: string,
  ) => void;
  clearPosition: () => void;
};

/**
 * Posição atual do entregador, fora do React.
 *
 * Store (e não estado de página) por dois motivos: o `watchPosition` do
 * rastreamento vive no `useDeliveryDriver` e precisa escrever aqui sem
 * conhecer quem lê; e a barra de abas desmonta a página a cada navegação, o
 * que jogaria fora uma posição informada à mão em Ajustes.
 */
export const useCourierPositionStore = create<CourierPositionState>((set) => ({
  position: null,
  setPosition: (coords, source, label) =>
    set({ position: { coords, source, at: Date.now(), label } }),
  clearPosition: () => set({ position: null }),
}));

// A posição é do entregador logado: o próximo a entrar no mesmo aparelho
// não calcula frete com a do anterior (LDMF-244). Mesmo gatilho do carrinho
// (LDMF-239) - todo caminho que troca o usuário passa pelo auth-store.
let boundUserId = useAuthStore.getState().user?.id ?? null;
useAuthStore.subscribe((state) => {
  const userId = state.user?.id ?? null;
  if (userId === boundUserId) return;
  boundUserId = userId;
  useCourierPositionStore.getState().clearPosition();
});

export function isPositionFresh(
  position: CourierPosition | null,
  now = Date.now(),
): position is CourierPosition {
  if (!position) return false;
  return now - position.at <= POSITION_MAX_AGE_MS;
}
