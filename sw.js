const CACHE_NAME = 'enkore-erp-v8';
const STATIC_FILES = [
  '/enkore-erp',
  '/enkore-erp.html',
  '/manifest.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/invoice-logo.png',
  '/assets/logo-white.png',
  // Panels precached at install → first open is instant, no blank wait
  '/panels/admin-dashboard.html',
  '/panels/drive.html',
  '/panels/sales-entry.html',
  '/panels/expense-entry.html',
  '/panels/clients-due.html',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(STATIC_FILES)).catch(() => {})
  );
  // NOTE: no skipWaiting() here — the new worker waits until the page sends
  // SKIP_WAITING (on fresh launch, or when the user taps the update banner),
  // so an update never reloads the app in the middle of data entry.
});

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Always network-only for Google & external APIs
  if (
    url.includes('docs.google.com') ||
    url.includes('script.google.com') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com') ||
    url.includes('workers.dev') ||
    url.includes('drive-thirdparty.googleusercontent.com')
  ) {
    return;
  }

  // Stale-while-revalidate for all HTML (shell + panels): serve the cached copy
  // INSTANTLY so panel switches never wait on the network (that wait was the
  // blank/white second during slide transitions), then refresh the cache in the
  // background. New deploys still reach users via the sw.js version bump, which
  // clears this cache and reloads.
  if (url.includes('.html') || url.endsWith('/enkore-erp')) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        const net = fetch(e.request)
          .then(res => {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
            return res;
          })
          .catch(() => cached);
        return cached || net;
      })
    );
    return;
  }

  // Cache-first for static assets (icons, images, manifest)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
