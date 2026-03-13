const CACHE     = 'aquacontrol-v5'
const API_CACHE = 'aquacontrol-api-v2'
const OFFLINE   = '/offline.html'

const PRECACHE = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
]

// API paths to cache with stale-while-revalidate
// NOT presentaciones — stock cambia con cada venta/produccion/traspaso
const CACHEABLE_API = ['/api/dashboard']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE && k !== API_CACHE)
            .map(k => caches.delete(k))
      )
    ).then(() => clients.claim())
  )
})

// Red primero, fallback a cache
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)

  // Nunca interceptar: socket, version.json
  if (url.pathname.includes('socket.io')) return
  if (url.pathname.includes('version.json')) return

  // Stale-while-revalidate for cacheable API GETs
  if (e.request.method === 'GET' && CACHEABLE_API.some(p => url.pathname.startsWith(p))) {
    e.respondWith(
      caches.open(API_CACHE).then(cache =>
        cache.match(e.request).then(cached => {
          const fetchPromise = fetch(e.request).then(res => {
            if (res.ok) cache.put(e.request, res.clone())
            return res
          }).catch(() => cached)

          return cached || fetchPromise
        })
      )
    )
    return
  }

  // Skip other API calls
  if (url.pathname.includes('/api/')) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
      .catch(() =>
        caches.match(e.request)
          .then(cached => cached || caches.match(OFFLINE))
      )
  )
})

// ── Web Push real (llega del servidor, incluso con app cerrada) ──
self.addEventListener('push', e => {
  if (!e.data) return

  let payload
  try { payload = e.data.json() } catch {
    payload = { title: 'AquaControl', body: e.data.text() }
  }

  const title = payload.title || 'AquaControl'
  const options = {
    body:               payload.body || '',
    icon:               '/icons/icon-192.png',
    badge:              '/icons/icon-96.png',
    tag:                `push-${Date.now()}`,
    renotify:           true,
    requireInteraction: true,
    vibrate:            [300, 100, 300, 100, 600],
    data:               payload.data || { url: '/' },
  }

  e.waitUntil(self.registration.showNotification(title, options))
})

// Mensajes desde el frontend
self.addEventListener('message', e => {
  // Forzar activación del nuevo SW
  if (e.data?.tipo === 'SKIP_WAITING') {
    self.skipWaiting()
    return
  }

  // Notificaciones push
  if (e.data?.tipo === 'nuevo_pedido') {
    const { nombre, numero } = e.data
    self.registration.showNotification(
      '📦 Nuevo pedido', {
        body: `Hola ${nombre}, tienes un nuevo pedido`,
        icon:  '/icons/icon-192.png',
        badge: '/icons/icon-96.png',
        tag:   `pedido-${numero || Date.now()}`,
        renotify:           true,
        requireInteraction: true,
        vibrate: [300, 100, 300, 100, 600],
        data: { url: '/repartidor/pedidos' }
      }
    )
  }
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  e.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    }).then(list => {
      const c = list.find(c =>
        c.url.includes(self.location.origin)
      )
      if (c) return c.focus()
      return clients.openWindow(
        e.notification.data?.url || '/'
      )
    })
  )
})
