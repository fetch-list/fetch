// Service worker: keeps the app shell in the Cache API so the page loads without a network.
// Strategy: stale-while-revalidate. Answer from the cache at once, refresh the cache in the background;
// a new version becomes visible on the next load. API requests are never cached here:
// list data lives in IndexedDB and is synced by the page itself.

const CACHE = 'fetch-shell-v3';
const SHELL = [
  './',
  'app.css',
  'icon.svg',
  'manifest.webmanifest',
  'js/app.js',
  'js/store.js',
  'js/db.js',
  'js/replica.js',
  'js/sync.js',
  'js/uuid.js',
  'js/shared/hlc.js',
  'js/shared/registers.js',
  'js/shared/model.js',
  'js/shared/ordering.js',
  'vendor/pico.min.css',
  'vendor/sortable.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  e.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const key = e.request.mode === 'navigate' ? './' : e.request;
      const cached = await cache.match(key);
      const refresh = fetch(e.request)
        .then((res) => {
          if (res.ok) cache.put(key, res.clone());
          return res;
        })
        .catch(() => cached ?? Response.error());
      if (cached) e.waitUntil(refresh);
      return cached ?? refresh;
    }),
  );
});
