const CACHE_NAME = 'enkore-erp-v1';
const SHELL_FILES = [
  '/enkore-erp.html',
  '/manifest.json',
  '/assets/logo-white.png'
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
  // Network first for Google Sheets (always fresh), cache first for shell
  const url = e.request.url;
  if (url.includes('docs.google.com') || url.includes('fonts.googleapis.com')) {
    return; // let browser handle
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
