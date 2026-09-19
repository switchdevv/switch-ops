'use client';

import { useEffect } from 'react';

/**
 * Registers public/sw.js, the cache that lets the console paint on a stalled connection
 * instead of staying blank (see the file itself for what it does and its kill switch).
 *
 * Production builds only: under `next dev` every file is rebuilt on the fly, and a cached
 * copy would be the wrong one. Browsers only allow a worker in a secure context, so the
 * console opened over plain http on a LAN IP simply runs without it.
 *
 * The page that registers the worker has already loaded its files from the network, before
 * the worker could see them — so it hands the worker that list, and the first visit is
 * covered as well as every later one.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;

    let isCancelled = false;
    navigator.serviceWorker
      // `updateViaCache: 'none'`: the browser re-checks the worker itself on every load, so a
      // deploy that changes it — the kill switch included — reaches a phone at once.
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        if (isCancelled) return;
        const urls = [
          window.location.href,
          ...performance
            .getEntriesByType('resource')
            .map((entry) => entry.name)
            .filter((name) => name.startsWith(`${window.location.origin}/_next/static/`)),
        ];
        registration.active?.postMessage({ type: 'warm', urls });
      })
      .catch(() => {
        // No worker: the console works exactly as it did before it had one.
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  return null;
}
