/*
 * Push notifications, loaded into the generated service worker.
 * The server sends Declarative Web Push JSON; iPhone (iOS 18.4+) shows those
 * by itself, and everything else hands them to this handler.
 */
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { notification: { title: event.data ? event.data.text() : 'Workout' } }
  }
  const n = data.notification || {}
  event.waitUntil(
    self.registration.showNotification(n.title || 'Workout', {
      body: n.body || '',
      tag: n.tag || undefined,
      renotify: Boolean(n.tag),
      icon: 'icon-192.png',
      data: { url: n.navigate || self.registration.scope },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || self.registration.scope
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((w) => w.url.startsWith(self.registration.scope))
      if (open) {
        await open.focus()
        if (open.url !== url && 'navigate' in open) await open.navigate(url).catch(() => {})
        return
      }
      await self.clients.openWindow(url)
    })(),
  )
})
