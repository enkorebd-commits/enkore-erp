const CACHE_NAME = 'enkore-erp-v20';
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
  '/panels/cash-s.html',
];

// Cloudflare Pages 308-redirects "/panels/x.html" → "/panels/x". A redirected
// response stored in the cache is REJECTED by Chrome when served to an iframe
// navigation (shows "temporarily down or moved permanently"). So every response
// is rebuilt into a clean, non-redirected Response before caching or serving.
async function sanitize(res) {
  const body = await res.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': res.headers.get('Content-Type') || 'text/html; charset=utf-8' }
  });
}

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c =>
      Promise.all(STATIC_FILES.map(async f => {
        try {
          const res = await fetch(f, { redirect: 'follow', cache: 'no-store' });
          if (res.ok) await c.put(f, await sanitize(res));
        } catch (_) {}
      }))
    ).catch(() => {})
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
      // ignoreSearch → a panel requested as /panels/x.html?userId=… still hits
      // the precached /panels/x.html. Without this the precache never matched
      // and a slow/failed network left the iframe blank on first open.
      const cached = await caches.match(e.request, { ignoreSearch: true });

      // Fetch by URL (not the navigation Request) so redirects are FOLLOWED
      // here instead of surfacing as an un-cacheable opaqueredirect.
      const fromNet = (async () => {
        const res = await fetch(e.request.url, { redirect: 'follow' });
        // Bad response (5xx, edge error page) → serve the cached copy instead
        // of rendering an error/white page inside the panel iframe.
        if (!res.ok) return cached || res;
        const clean = await sanitize(res);
        // Cache under the query-stripped URL so every user/session shares
        // one fresh copy per file.
        caches.open(CACHE_NAME).then(c => c.put(url.split('?')[0], clean.clone())).catch(() => {});
        return clean;
      })();

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
