/* eslint-disable */
/* global self, caches, fetch, URL, Response */

/**
 * switch-ops' service worker: the console's own files, kept on the device.
 *
 * Why it exists. Every page of the console carries two render-blocking stylesheets (one
 * of them HeroUI's whole bundle) and its HTML is revalidated on every load
 * (firebase.json). A phone that reloads the console while its connection is stalled —
 * Android reloads a background tab after a call, routinely — paints *nothing* until those
 * arrive: a blank page, for as long as the connection stays bad. From this cache it paints
 * at once, and the console's own deadlines (src/lib/parse/deadline.ts) deal with the data.
 *
 * What it does, and nothing else:
 *
 * - `/_next/static/**` — scripts, stylesheets, fonts — **cache first**. Their names carry a
 *   hash of their content, so a cached copy can never be the wrong one. Several builds are
 *   kept (trimmed oldest first), so a tab still running an older build after a deploy can
 *   load its lazy chunks (the live map) instead of failing with a ChunkLoadError.
 * - Pages and the router's `.txt` payloads — **network first, 3 s**, then the last good
 *   copy of that path. A working connection gets every deploy immediately; a stalled one
 *   gets the console instead of a blank page. The query string is ignored: the static
 *   export serves the same file whatever `?…` says.
 * - Everything else passes straight through, untouched: other origins (the Parse API,
 *   map tiles), anything that isn't a GET, range requests (the alert sound), this file.
 *
 * The page registers it in production builds only (src/components/service-worker.tsx),
 * and posts the files it already loaded so the very first visit is covered too.
 *
 * KILL SWITCH. If this ever misbehaves, replace this file's contents with:
 *
 *   self.addEventListener('install', () => self.skipWaiting());
 *   self.addEventListener('activate', (event) => event.waitUntil(
 *     caches.keys()
 *       .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
 *       .then(() => self.registration.unregister())
 *       .then(() => self.clients.matchAll())
 *       .then((clients) => clients.forEach((client) => client.navigate(client.url)))
 *   ));
 *
 * and deploy. Browsers re-check this file on every visit (it is served `max-age=0`), so each
 * device drops the worker and its caches on its next load.
 *
 * Bump VERSION when this file's caching rules change; activate deletes every other version.
 */

const VERSION = 1;
const PREFIX = 'switch-ops-';
const PAGES = `${PREFIX}pages-v${VERSION}`;
const ASSETS = `${PREFIX}assets-v${VERSION}`;

/** How long a page waits for the network before the cached copy is shown instead. */
const NETWORK_TIMEOUT_MS = 3000;

/** Roughly six builds' worth of hashed files. */
const MAX_ASSETS = 400;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(PREFIX) && key !== PAGES && key !== ASSETS)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (request.headers.has('range')) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === '/sw.js' || url.pathname.startsWith('/__/')) return;

  if (isAsset(url)) {
    event.respondWith(cacheFirst(event, request));
    return;
  }
  if (request.mode === 'navigate' || url.pathname.endsWith('.txt')) {
    event.respondWith(networkFirst(event, request, url));
  }
});

/** The page hands over what it already loaded before this worker controlled it. */
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'warm' || !Array.isArray(data.urls)) return;
  event.waitUntil(warm(data.urls));
});

function isAsset(url) {
  return url.pathname.startsWith('/_next/static/');
}

/** The key a page is stored under: its path alone. */
function pageKey(url) {
  return `${url.origin}${url.pathname}`;
}

function isStorable(response) {
  return response && response.ok && response.type === 'basic' && !response.redirected;
}

async function cacheFirst(event, request) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(request, { ignoreSearch: true, ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (isStorable(response)) {
    event.waitUntil(cache.put(request, response.clone()).then(trimAssets).catch(() => {}));
  }
  return response;
}

async function networkFirst(event, request, url) {
  const cache = await caches.open(PAGES);
  const key = pageKey(url);

  const network = fetch(request).then(async (response) => {
    if (isStorable(response)) await cache.put(key, response.clone()).catch(() => {});
    return response;
  });
  // Keeps the worker alive until the page is fetched and stored, even when the cached copy
  // was already handed back.
  event.waitUntil(network.then(() => undefined, () => undefined));

  const cached = await cache.match(key, { ignoreVary: true });
  if (!cached) return network;

  return new Promise((resolve) => {
    let isSettled = false;
    const settle = (response) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timer);
      resolve(response);
    };
    const timer = setTimeout(() => settle(cached), NETWORK_TIMEOUT_MS);
    network.then(
      // A 404 or 5xx from the host is no better than what we have.
      (response) => settle(response.ok || response.type === 'opaqueredirect' ? response : cached),
      () => settle(cached),
    );
  });
}

async function warm(urls) {
  const assets = await caches.open(ASSETS);
  const pages = await caches.open(PAGES);
  await Promise.all(
    urls.map(async (raw) => {
      try {
        const url = new URL(raw, self.location.origin);
        if (url.origin !== self.location.origin) return;
        if (isAsset(url)) {
          if (await assets.match(url.href, { ignoreSearch: true, ignoreVary: true })) return;
          // Straight from the HTTP cache, which the page has just filled.
          const response = await fetch(url.href);
          if (isStorable(response)) await assets.put(url.href, response);
          return;
        }
        if (url.pathname.endsWith('.txt') || !url.pathname.includes('.')) {
          const response = await fetch(url.href, { credentials: 'same-origin' });
          if (isStorable(response)) await pages.put(pageKey(url), response);
        }
      } catch {
        // One file that can't be had doesn't stop the rest.
      }
    }),
  );
  await trimAssets();
}

/** Drops the oldest hashed files once there are more than a few builds' worth. The Cache
 * API lists keys in the order they were stored, so the front of the list is the oldest. */
async function trimAssets() {
  const cache = await caches.open(ASSETS);
  const keys = await cache.keys();
  const excess = keys.length - MAX_ASSETS;
  if (excess <= 0) return;
  await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
}
