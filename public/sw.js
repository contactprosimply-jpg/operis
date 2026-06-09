/* Operis PWA — service worker minimal (install + shell) */
const CACHE = 'operis-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(['/favicon.svg'])).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.pathname.startsWith('/api/')) return
  if (url.origin !== self.location.origin) return
  event.respondWith(
    fetch(request).catch(() => caches.match(request).then((r) => r || caches.match('/favicon.svg')))
  )
})
