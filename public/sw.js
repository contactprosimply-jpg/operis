/* Operis PWA — assets only; ne pas intercepter les navigations (évite shell vide au réveil) */
const CACHE = 'operis-v2'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['/favicon.svg'])).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/')) return
  if (url.origin !== self.location.origin) return

  // Document / navigation : laisser le navigateur gérer (pas de fetch SW qui hang ~60s)
  if (request.mode === 'navigate' || request.destination === 'document') return

  event.respondWith(
    fetch(request).catch(() =>
      caches.match(request).then((r) => r || caches.match('/favicon.svg'))
    )
  )
})
