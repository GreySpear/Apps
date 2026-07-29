/*
 * Home Log — service worker for offline support.
 *
 * Goal: the app shell (this single-file web app + its fonts) loads with NO
 * connection, so you can check what's due and log a repair in a basement with
 * no signal. Your data already lives in localStorage and syncs to the Google
 * Apps Script backend when online — this only makes the *shell* offline-capable.
 *
 * Strategy:
 *   - App shell (same-origin HTML/assets): stale-while-revalidate. Serve the
 *     cached copy instantly, fetch a fresh one in the background so the next
 *     open is up to date. Offline navigations fall back to the cached shell.
 *   - Google Fonts (CSS + font files): cache-first — once seen online they
 *     render offline too; without them the app still works (system-font
 *     fallbacks are already in the CSS).
 *   - Backend calls (Apps Script): never touched here. GETs pass straight to
 *     the network so data stays live; POSTs (writes / photo uploads) are
 *     ignored by the fetch handler entirely. When offline these fail and the
 *     app falls back to its localStorage cache on its own.
 *
 * Updating: bump VERSION to roll all caches (old ones are deleted on activate).
 * Even without a bump, stale-while-revalidate pulls a fresh index.html in the
 * background, so shipping a new build reaches devices on their next-but-one open.
 */
const VERSION = 'v1';
const SHELL_CACHE = 'homelog-shell-' + VERSION;
const RUNTIME_CACHE = 'homelog-runtime-' + VERSION;
const SHELL = ['./', './index.html'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;                 // leave sync writes (POST) alone
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = FONT_HOSTS.indexOf(url.hostname) !== -1;

  // Live backend data (Apps Script, etc.) — always straight to the network.
  if (!sameOrigin && !isFont) return;

  if (isFont) { event.respondWith(cacheFirst(req, RUNTIME_CACHE)); return; }
  event.respondWith(staleWhileRevalidate(req, SHELL_CACHE));
});

function cacheable_(res) {
  // Keep 200s and opaque (cross-origin, no-CORS) font responses; skip errors.
  return res && (res.ok || res.type === 'opaque');
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (cacheable_(res)) cache.put(req, res.clone());
    return res;
  } catch (e) {
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (cacheable_(res)) cache.put(req, res.clone());
    return res;
  }).catch(() => null);

  if (cached) return cached;                        // fast path
  const net = await network;
  if (net) return net;

  // Offline and never cached this exact URL — fall back to the app shell.
  if (req.mode === 'navigate') {
    const shell = await cache.match('./index.html') || await cache.match('./');
    if (shell) return shell;
  }
  return new Response('Offline', { status: 503, statusText: 'Offline' });
}
