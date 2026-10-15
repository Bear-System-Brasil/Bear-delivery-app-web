/**
 * Ponto único de entrada para gerar uma notificação: alimenta o sino
 * (`notifications-store`) e, se permitido, o popup do navegador. Chamado de
 * fora de componentes (callback de socket, efeito de polling), por isso é
 * função imperativa e não hook - mesmo espírito do `soundManager`.
 */

import { showBrowserNotification } from '@/lib/browser-notifications'
import { usePreferencesStore } from '@/stores/preferences-store'
import {
  useNotificationsStore,
  type NotificationAudience,
} from '@/stores/notifications-store'

interface NotifyInput {
  audience: NotificationAudience
  title: string
  body: string
  href?: string
}

export function notify({ audience, title, body, href }: NotifyInput): void {
  useNotificationsStore.getState().addNotification({ audience, title, body, href })

  if (usePreferencesStore.getState().notifications.push) {
    showBrowserNotification(title, { body, href })
  }
}
