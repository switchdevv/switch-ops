/**
 * Recovering from a script chunk that can't be loaded.
 *
 * Firebase Hosting replaces the whole site on a deploy, so a tab opened before it still
 * asks for the previous build's lazily loaded files (the live map, the restaurant form's
 * location map) — which are gone. The service worker (public/sw.js) keeps recent builds'
 * files for exactly this, but a browser without it, or with a cache it cleared, gets a
 * `ChunkLoadError`. Loading the page again fetches the current build, which is the fix.
 *
 * Once per tab per minute: a chunk that fails even on a fresh page (a broken deploy, a
 * connection that is down) must not become a reload loop. After that, the error screen
 * with its buttons is what shows.
 */

const GUARD_KEY = 'switch-ops.chunk-reload-at';
const GUARD_MS = 60_000;

export function isChunkLoadError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === 'ChunkLoadError') return true;
  return (
    typeof message === 'string' &&
    /loading (css )?chunk|failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module/i.test(
      message,
    )
  );
}

/** Reloads the page, unless this tab already did so in the last minute. True when it did. */
export function reloadOnceForChunkError(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(GUARD_KEY) ?? 0);
    if (Date.now() - last < GUARD_MS) return false;
    window.sessionStorage.setItem(GUARD_KEY, String(Date.now()));
  } catch {
    // No storage means no guard, and an unguarded reload could loop. Don't.
    return false;
  }
  window.location.reload();
  return true;
}
