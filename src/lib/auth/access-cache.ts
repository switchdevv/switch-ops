import type { SwitchUser } from '@/types/user';

/**
 * The last access row the server confirmed for an account, remembered in this browser.
 *
 * The start-up gate (components/require-auth.tsx) used to wait on a round-trip before
 * showing anything, on every page load. On a phone whose connection has stalled — a tab
 * Android reloads after a call, say — that round-trip is exactly what never comes back. So
 * the gate opens from this copy and re-reads the row straight after (hooks/use-access.ts):
 * a revoked grant or a moved region still takes effect, a second later instead of before
 * the first paint.
 *
 * That is safe because the gate is a UX gate, not a security boundary: Parse's class
 * permissions refuse a request the account may not make, whatever the console rendered.
 *
 * Bounded to a day, so a browser that hasn't opened the console in a while asks the server
 * before showing it. Every access is guarded: a browser that refuses storage just doesn't
 * remember, and the gate waits for the server as it always did.
 */

const PREFIX = 'switch-ops.access.';

export const ACCESS_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Stored = { row: SwitchUser; at: number };

/** The remembered row and when it was confirmed, or null. */
export function readCachedAccess(userId: string): Stored | null {
  if (!userId || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + userId);
    const parsed = raw ? (JSON.parse(raw) as Partial<Stored>) : null;
    if (!parsed || typeof parsed.at !== 'number' || !parsed.row || typeof parsed.row !== 'object') return null;
    if (parsed.row.objectId !== userId) return null;
    if (Date.now() - parsed.at > ACCESS_CACHE_MAX_AGE_MS) return null;
    return { row: parsed.row, at: parsed.at };
  } catch {
    return null;
  }
}

/** Remembers the row the server just returned — or forgets the account when it returned
 * none, so a deleted account can't open the console from an old copy. */
export function writeCachedAccess(userId: string, row: SwitchUser | null): void {
  if (!userId || typeof window === 'undefined') return;
  try {
    if (row) window.localStorage.setItem(PREFIX + userId, JSON.stringify({ row, at: Date.now() } satisfies Stored));
    else window.localStorage.removeItem(PREFIX + userId);
  } catch {
    // Not remembered; the next load waits for the server.
  }
}
