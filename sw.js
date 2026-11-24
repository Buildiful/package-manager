/* Offline app shell. Third-party requests are never cached. */
const CACHE_NAME = 'package-manager-v1.0.0';
const CACHE_PREFIX = 'package-manager-';
const PRELOAD = [
  './', './index.html', './privacy.html', './styles.css', './js/app.js',
  './js/buildiful-analytics.js', './manifest.webmanifest',
  './assets/favicon.ico', './assets/favicon-16x16.png', './assets/favicon-32x32.png',
  './assets/apple-touch-icon.png', './assets/buildiful-logo-white.png',
  './assets/package-icon-180.png', './assets/package-icon-192.png', './assets/package-icon-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(PRELOAD)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const url = new URL(request.url);
  if (!url.pathname.startsWith(new URL('./', self.registration.scope).pathname)) return;
  event.respondWith(caches.match(request).then(async cached => {
    if (cached) {
      const range = request.headers.get('range');
      if (range && url.pathname.endsWith('/music/parcel-route.mp3')) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (match) {
          const bytes = await cached.arrayBuffer();
          const total = bytes.byteLength;
          const start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2]));
          const end = match[2] && match[1] ? Math.min(total - 1, Number(match[2])) : total - 1;
          if (start >= total || end < start) return new Response(null, {status:416,headers:{'Content-Range':`bytes */${total}`}});
          return new Response(bytes.slice(start,end+1), {status:206, headers:{
            'Content-Type':'audio/mpeg','Content-Range':`bytes ${start}-${end}/${total}`,
            'Content-Length':String(end-start+1),'Accept-Ranges':'bytes'
          }});
        }
      }
      return cached;
    }
    return fetch(request).then(response => {
      if (response.ok && response.type === 'basic') {
        // Music is fetched and cached only if the user enables it.
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone)).catch(() => {});
      }
      return response;
    }).catch(() => {
      if (request.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    });
  }));
});

// Download the full music file only after the user enables music. The site
// shell stays light on first visit, while subsequent plays can work offline.
self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_MUSIC') return;
  event.waitUntil(caches.open(CACHE_NAME).then(async cache => {
    if (!(await cache.match('./music/parcel-route.mp3'))) {
      try {await cache.add('./music/parcel-route.mp3');} catch (_) {/* No offline music if storage/network is unavailable. */}
    }
  }));
});
