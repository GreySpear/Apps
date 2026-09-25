/*
 * Waypoint — service worker.
 *
 * Goal: after the first online load, the whole app opens and runs with NO
 * network — landing at an airport, driving Big Sur with no signal. Trip data
 * lives in IndexedDB (inherently offline); this SW only makes the *shell*
 * (HTML/CSS/JS/icons/fonts + the bundled trips) available offline.
 *
 * Strategy:
 *   - App shell (same-origin): cache-first, so it opens instantly and offline.
 *     A background refresh updates the cached copy for next launch. Offline
 *     navigations fall back to the cached index.html.
 *   - Google Fonts: cache-first once seen (system-font fallbacks cover the gap).
 *   - Everything else (e.g. maps deep-links opened in a new tab): straight to
 *     the network, untouched.
 *
 * Updating: bump VERSION to roll all caches (old ones deleted on activate).
 */
const VERSION = 'v2';
const SHELL_CACHE = 'waypoint-shell-' + VERSION;
const RUNTIME_CACHE = 'waypoint-runtime-' + VERSION;
const SHELL = [
  './', './index.html', './styles.css', './app.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
  './trips/index.json',
  './trips/portland-maine-2026.json', './trips/philadelphia-2026.json', './trips/california-2027.json',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // addAll is atomic — allSettled-style tolerance so one 404 doesn't fail install
      .then((cache) => Promise.all(SHELL.map((u) => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = FONT_HOSTS.indexOf(url.hostname) !== -1;

  if (!sameOrigin && !isFont) return;           // maps links etc. — leave to network
  if (isFont) { event.respondWith(cacheFirst(req, RUNTIME_CACHE)); return; }
  event.respondWith(cacheFirstShell(req));
});

function cacheable(res) { return res && (res.ok || res.type === 'opaque'); }

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (cacheable(res)) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return cached || Response.error();
  }
}

async function cacheFirstShell(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  if (cached) {
    // refresh in the background for next launch
    fetch(req).then((res) => { if (cacheable(res)) cache.put(req, res.clone()); }).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(req);
    if (cacheable(res)) cache.put(req, res.clone());
    return res;
  } catch (e) {
    if (req.mode === 'navigate') {
      const shell = await cache.match('./index.html') || await cache.match('./');
      if (shell) return shell;
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}
