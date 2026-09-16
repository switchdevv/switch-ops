/**
 * A list's last query string, remembered in the browser so its filters survive leaving
 * the page — through the sidebar, a breadcrumb, a form's Save or Cancel, a reload of the
 * bare path — all of which land on the path without a query string.
 *
 * The URL stays the source of truth: this is only read when the URL carries no filters,
 * and a list that is cleared on purpose clears what is remembered too. Scoped by account,
 * so signing in as someone else on the same browser doesn't inherit another person's list.
 *
 * Every access is guarded: a browser that refuses storage (Safari private mode throws on
 * write) just doesn't remember.
 */

const PREFIX = 'switch-ops.search.';

/** The remembered `?…` string, or null when there is none. */
export function readRememberedSearch(scope: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(PREFIX + scope);
    return value && value.startsWith('?') ? value : null;
  } catch {
    return null;
  }
}

/** Remembers `search` (a `?…` string), or forgets the list when it is empty. */
export function writeRememberedSearch(scope: string, search: string): void {
  if (typeof window === 'undefined') return;
  try {
    if (search) window.localStorage.setItem(PREFIX + scope, search);
    else window.localStorage.removeItem(PREFIX + scope);
  } catch {
    // Not remembered; the URL still carries the filters for this visit.
  }
}
