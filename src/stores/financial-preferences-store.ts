/**
 * =============================================================================
 * FINANCIAL PREFERENCES STORE - PREFERÊNCIAS DO MÓDULO FINANCEIRO
 * =============================================================================
 *
 * Preferências locais (owner/admin) para as telas de /financial-management.
 * Não existe endpoint de "configurações financeiras" no backend - isso vive
 * só no navegador de quem opera o caixa, separado do usePreferencesStore
 * (que é do cliente final, não do dono da empresa).
 */

import { PaymentMethod } from '@/services/api'
import { STORAGE_KEYS } from '@/utils/storage-manager'
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

/**
 * Operações do caixa que pré-selecionam um método. Mesmo conjunto do
 * MovementType da tela de caixa.
 */
export type CashMovementOperation = 'sale' | 'deposit' | 'refund' | 'withdrawal'

/**
 * Override por operação (LDMF-463): um método fixo, ou 'none' (abrir sem
 * método). Ausência da chave = seguir o padrão (global para não-sangria;
 * sem método para sangria).
 */
export type OperationMethodOverride = PaymentMethod | 'none'

interface FinancialPreferences {
  // Método pré-selecionado por padrão (vale pras operações sem customização,
  // exceto sangria, que abre sem método).
  defaultPaymentMethod: PaymentMethod
  // Customização por operação. Vazio = ninguém customizou, tudo segue o padrão.
  paymentMethodByOperation: Partial<
    Record<CashMovementOperation, OperationMethodOverride>
  >
  // Exige marcar uma confirmação extra antes de fechar o caixa.
  confirmBeforeCloseRegister: boolean
}

interface FinancialPreferencesState extends FinancialPreferences {
  setDefaultPaymentMethod: (method: PaymentMethod) => void
  // 'default' remove o override (volta a seguir o padrão); um método ou 'none'
  // grava o override.
  setOperationMethod: (
    operation: CashMovementOperation,
    value: OperationMethodOverride | 'default',
  ) => void
  setConfirmBeforeCloseRegister: (value: boolean) => void
  resetFinancialPreferences: () => void
}

const defaultFinancialPreferences: FinancialPreferences = {
  defaultPaymentMethod: PaymentMethod.CASH,
  paymentMethodByOperation: {},
  confirmBeforeCloseRegister: true,
}

export const useFinancialPreferencesStore = create<FinancialPreferencesState>()(
  devtools(
    persist(
      (set) => ({
        ...defaultFinancialPreferences,

        setDefaultPaymentMethod: (method) =>
          set(
            { defaultPaymentMethod: method },
            false,
            'financial-preferences/setDefaultPaymentMethod',
          ),

        setOperationMethod: (operation, value) =>
          set(
            (state) => {
              // Sempre cria um objeto novo: nunca muta a referência (inclusive
              // o {} do default), pra não vazar estado entre resets.
              const next = { ...state.paymentMethodByOperation }
              if (value === 'default') {
                delete next[operation]
              } else {
                next[operation] = value
              }
              return { paymentMethodByOperation: next }
            },
            false,
            'financial-preferences/setOperationMethod',
          ),

        setConfirmBeforeCloseRegister: (value) =>
          set(
            { confirmBeforeCloseRegister: value },
            false,
            'financial-preferences/setConfirmBeforeCloseRegister',
          ),

        resetFinancialPreferences: () =>
          set(
            { ...defaultFinancialPreferences, paymentMethodByOperation: {} },
            false,
            'financial-preferences/reset',
          ),
      }),
      {
        name: STORAGE_KEYS.FINANCIAL_PREFERENCES,
        version: 2,
        // v1 não tinha paymentMethodByOperation: garante o default ao hidratar
        // um estado antigo do localStorage.
        migrate: (persisted) => {
          const state = (persisted as Partial<FinancialPreferences>) ?? {}
          return {
            ...state,
            paymentMethodByOperation: state.paymentMethodByOperation ?? {},
          }
        },
      },
    ),
    {
      name: 'financial-preferences-store',
      enabled: process.env.NODE_ENV !== 'production',
    },
  ),
)
