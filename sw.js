const CACHE_NAME = 'enkore-erp-v11';
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
  '/panels/approval-s.html',
  '/panels/profile-s.html',
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
  // Only GET is cacheable — HEAD (used by the app's update check) and POST
  // must pass straight through, or cache.put() throws.
  if (e.request.method !== 'GET') return;

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

  // NETWORK-FIRST (with a short timeout) for all HTML — shell + panels.
  //
  // The old strategy was stale-while-revalidate: it served the cached copy and
  // refreshed the cache in the background. That made a new deploy invisible
  // until something forced a full page reload — and an installed PWA resumed
  // from memory never reloads. So updated panels sat in the cache, unused.
  //
  // Now: try the network first, but give up after TIMEOUT_MS and fall back to
  // cache. On a normal connection the user always gets the newest file; on a
  // bad connection or offline they still get the cached copy fast.
  if (url.includes('.html') || url.endsWith('/enkore-erp')) {
    const TIMEOUT_MS = 2500;
    e.respondWith((async () => {
      const cached = await caches.match(e.request);

      const fromNet = fetch(e.request).then(res => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone)).catch(() => {});
        }
        return res;
      });

      // Whichever resolves first: the network, or the timeout handing back cache.
      if (!cached) return fromNet;
      const timeout = new Promise(resolve => setTimeout(() => resolve(cached), TIMEOUT_MS));
      try {
        return await Promise.race([fromNet, timeout]);
      } catch (_) {
        return cached; // network errored outright (offline)
      }
    })());
    return;
  }

  // Cache-first for static assets (icons, images, manifest)
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
