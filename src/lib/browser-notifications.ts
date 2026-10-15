/**
 * Wrapper fino sobre a Web Notification API (popup nativo do SO/navegador).
 *
 * Isto não é Web Push: não há Service Worker nem servidor de push por trás -
 * só funciona enquanto o navegador está aberto (ainda que a aba esteja em
 * segundo plano). Para notificar com o navegador fechado seria necessário
 * VAPID + Service Worker + endpoint de push no backend, que este projeto
 * (frontend puro, backend em bearsystem.tech) não tem hoje.
 */

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function getBrowserNotificationPermission():
  | NotificationPermission
  | 'unsupported' {
  if (!isBrowserNotificationSupported()) return 'unsupported'
  return Notification.permission
}

export async function requestBrowserNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (!isBrowserNotificationSupported()) return 'unsupported'
  return Notification.requestPermission()
}

interface ShowBrowserNotificationOptions {
  body?: string
  href?: string
}

/**
 * Só dispara com a aba em segundo plano - em primeiro plano o sino (badge +
 * lista) já avisa, e um popup do SO ali em cima seria só ruído duplicado.
 */
export function showBrowserNotification(
  title: string,
  options: ShowBrowserNotificationOptions = {},
): void {
  if (!isBrowserNotificationSupported()) return
  if (Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return

  const notification = new Notification(title, {
    body: options.body,
    icon: '/apple-touch-icon.png',
    badge: '/apple-touch-icon.png',
    tag: 'like-delivery-notification',
  })

  notification.onclick = () => {
    window.focus()
    if (options.href && typeof window !== 'undefined') {
      window.location.href = options.href
    }
    notification.close()
  }
}
