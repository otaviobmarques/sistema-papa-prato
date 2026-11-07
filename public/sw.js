// Service worker do Papa Prato: guarda o app, o site e a base de alimentos para funcionar offline.
// Estratégia "rede primeiro": sempre tenta a versão nova e usa o que está guardado só sem internet.
const CACHE = 'papa-prato-v4'
const ESSENCIAL = ['/', '/app/', '/data/alimentos.json', '/manifest.webmanifest', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png', '/apple-touch-icon.png']
self.addEventListener('install', e => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then(c => c.addAll(ESSENCIAL))) })
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())))
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url)
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return
  e.respondWith(
    fetch(e.request)
      .then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)) } return r })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || (e.request.mode === 'navigate' ? caches.match(url.pathname.startsWith('/app') ? '/app/' : '/') : undefined)))
  )
})

// Lembretes no celular (Web Push): água e refeições.
self.addEventListener('push', e => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { body: e.data && e.data.text() } }
  e.waitUntil(self.registration.showNotification(d.title || 'Papa Prato', {
    body: d.body || '', tag: d.tag || 'papa-prato', renotify: true,
    icon: '/icons/icon-192.png', badge: '/icons/favicon-48.png', data: { url: d.url || '/app/' },
  }))
})
self.addEventListener('notificationclick', e => {
  e.notification.close()
  const alvo = new URL((e.notification.data && e.notification.data.url) || '/app/', location.origin).href
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(janelas => {
    const app = janelas.find(j => new URL(j.url).pathname.startsWith('/app'))
    if (app) return app.navigate(alvo).then(j => (j || app).focus()).catch(() => app.focus())
    return self.clients.openWindow(alvo)
  }))
})
