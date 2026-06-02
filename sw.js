const CACHE_NAME = 'enkore-erp-v4';
const SHELL_FILES = [
  '/enkore-erp',
  '/enkore-erp.html',
  '/manifest.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/logo-white.png',
  '/panels/drive.html',
  '/panels/admin-dashboard.html',
  '/panels/sales-entry.html'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
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
  // Always network-first for Google services and external APIs
  if (
    url.includes('docs.google.com') ||
    url.includes('script.google.com') ||
    url.includes('fonts.googleapis.com') ||
    url.includes('fonts.gstatic.com') ||
    url.includes('drive-thirdparty.googleusercontent.com') ||
    url.includes('workers.dev')
  ) {
    return;
  }
  // Network-first for HTML files so updates are always picked up
  if (url.includes('.html') || url.endsWith('/enkore-erp')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // Cache-first for everything else (assets, icons)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
