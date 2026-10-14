/**
 * =============================================================================
 * PREFERENCES STORE - PREFERÊNCIAS DO USUÁRIO
 * =============================================================================
 * 
 * Gerencia preferências do usuário como theme, language, notificações
 * Persiste em localStorage
 */

import { soundManager } from '@/lib/sound'
import { STORAGE_KEYS } from '@/utils/storage-manager'
import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'

interface Preferences {
  // Aparência
  theme: 'light' | 'dark' | 'system'

  // Notificações
  notifications: {
    push: boolean
    email: boolean
    sms: boolean
    orderUpdates: boolean
    promotions: boolean
  }

  // Localização e idioma
  language: 'pt-BR' | 'en-US' | 'es-ES'
  currency: 'BRL' | 'USD' | 'EUR'

  // Preferências de entrega
  defaultAddress?: string // ID do endereço padrão
  saveOrderHistory: boolean

  // UI Preferences
  compactMode: boolean
  showOnboarding: boolean
  lastViewedRestaurant?: string

  /** Alerta sonoro de pedidos no painel. Ligado por padrão (LDMF-329). */
  kitchenSoundEnabled: boolean
}

interface PreferencesState extends Preferences {
  // Actions
  setTheme: (theme: Preferences['theme']) => void
  setLanguage: (language: Preferences['language']) => void
  updateNotifications: (notifications: Partial<Preferences['notifications']>) => void
  setDefaultAddress: (addressId: string) => void
  setCompactMode: (compact: boolean) => void
  setKitchenSound: (enabled: boolean) => void
  dismissOnboarding: () => void
  setLastViewedRestaurant: (restaurantId: string) => void
  resetPreferences: () => void
}

const defaultPreferences: Preferences = {
  theme: 'system',
  notifications: {
    push: true,
    email: true,
    sms: false,
    orderUpdates: true,
    promotions: true,
  },
  language: 'pt-BR',
  currency: 'BRL',
  saveOrderHistory: true,
  compactMode: false,
  showOnboarding: true,
  kitchenSoundEnabled: true,
}

export const usePreferencesStore = create<PreferencesState>()(
  devtools(
    persist(
      (set) => ({
        ...defaultPreferences,

        setTheme: (theme) =>
          set(
            { theme },
            false,
            'preferences/setTheme'
          ),

        setLanguage: (language) =>
          set(
            { language },
            false,
            'preferences/setLanguage'
          ),

        updateNotifications: (notifications) =>
          set(
            (state) => ({
              notifications: { ...state.notifications, ...notifications },
            }),
            false,
            'preferences/updateNotifications'
          ),

        setDefaultAddress: (addressId) =>
          set(
            { defaultAddress: addressId },
            false,
            'preferences/setDefaultAddress'
          ),

        setCompactMode: (compact) =>
          set(
            { compactMode: compact },
            false,
            'preferences/setCompactMode'
          ),

        setKitchenSound: (enabled) => {
          soundManager.setMuted(!enabled)
          return set(
            { kitchenSoundEnabled: enabled },
            false,
            'preferences/setKitchenSound'
          )
        },

        dismissOnboarding: () =>
          set(
            { showOnboarding: false },
            false,
            'preferences/dismissOnboarding'
          ),

        setLastViewedRestaurant: (restaurantId) =>
          set(
            { lastViewedRestaurant: restaurantId },
            false,
            'preferences/setLastViewedRestaurant'
          ),

        resetPreferences: () => {
          soundManager.setMuted(!defaultPreferences.kitchenSoundEnabled)
          return set(
            defaultPreferences,
            false,
            'preferences/reset'
          )
        },
      }),
      {
        name: STORAGE_KEYS.PREFERENCES,
        version: 3,
        migrate: (persistedState, version) => {
          const state = persistedState as PreferencesState
          if (version < 3) {
            state.kitchenSoundEnabled = true
          }
          return state
        },
      }
    ),
    { name: 'preferences-store', enabled: process.env.NODE_ENV !== 'production' }
  )
)

if (typeof window !== 'undefined' && typeof soundManager?.subscribe === 'function') {
  soundManager.subscribe(() => {
    const soundEnabled = !soundManager.isMuted()
    if (usePreferencesStore.getState().kitchenSoundEnabled !== soundEnabled) {
      usePreferencesStore.setState({ kitchenSoundEnabled: soundEnabled })
    }
  })
}

