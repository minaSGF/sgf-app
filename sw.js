const CACHE = 'sgf-app-v2';
const SHELL = [
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The Google Sheet API (JSONP) must always go to the network, never the cache
  if (url.hostname.endsWith('script.google.com') || url.hostname.endsWith('googleusercontent.com')) return;

  // Opening the app: network first (so updates arrive), but fall back to the saved
  // copy when offline or when the connection is too slow (3.5s)
  if (req.mode === 'navigate') {
    const fromNet = fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy)); }
      return res;
    });
    fromNet.catch(() => {});
    const slow = new Promise(r => setTimeout(() => r(null), 3500));
    e.respondWith(
      Promise.race([fromNet, slow])
        .then(res => res || caches.match('./index.html').then(c => c || fromNet))
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Icons, manifest, fonts: cache first, refresh in the background
  const sameOrigin = url.origin === location.origin;
  const isFont = url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com');
  if (sameOrigin || isFont) {
    e.respondWith(
      caches.match(req).then(cached => {
        const net = fetch(req)
          .then(res => {
            if (res && (res.ok || res.type === 'opaque')) {
              const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || net;
      })
    );
  }
});
