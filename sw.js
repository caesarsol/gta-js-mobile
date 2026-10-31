const GTA_DATA_CACHE_NAME = 'gta-js-data-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Normalizes a request URL pathname containing `/data/` into a canonical `data/<UPPERCASE_PATH>` relative path.
 */
function normalizeDataPath(pathname) {
  const match = /(?:^|\/)data\/(.+)$/i.exec(pathname);
  if (!match) return null;
  const segments = match[1]
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== '.' && s !== '..');
  if (segments.length === 0) return null;
  return `data/${segments.map((s) => s.toUpperCase()).join('/')}`;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.origin !== self.location.origin) return;

  const canonicalPath = normalizeDataPath(url.pathname);
  if (!canonicalPath) return;

  event.respondWith(
    (async () => {
      try {
        const cache = await caches.open(GTA_DATA_CACHE_NAME);
        const scopeBase = self.registration ? self.registration.scope : self.location.origin + '/';
        const canonicalUrl = new URL(canonicalPath, scopeBase).href;
        const cachedResponse =
          (await cache.match(canonicalUrl)) || (await cache.match(request));
        if (cachedResponse) {
          return cachedResponse;
        }
      } catch {
        // Fall through to network fetch if CacheStorage lookup fails
      }
      return fetch(request);
    })()
  );
});
