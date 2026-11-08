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
  orderId?: string
  /**
   * Texto próprio pro popup do SO. Ele usa uma tag só (o novo substitui o
   * anterior), então numa rajada precisa dizer o total, não só o último.
   */
  system?: { title: string; body: string }
}

export function notify({ audience, title, body, href, orderId, system }: NotifyInput): void {
  useNotificationsStore.getState().addNotification({ audience, title, body, href, orderId })

  if (usePreferencesStore.getState().notifications.push) {
    showBrowserNotification(system?.title ?? title, { body: system?.body ?? body, href })
  }
}
