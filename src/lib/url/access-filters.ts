/**
 * The Access page's state, in the query string — the same bargain as every other list in
 * the console: a pasted link opens the same list, Back undoes a filter. Every value is
 * untrusted and narrowed on the way in; every default is left out on the way back, so the
 * unfiltered list keeps the bare `/access` URL.
 */

const KEYS = {
  query: 'q',
  access: 'access',
  page: 'page',
} as const;

/**
 * Which slice of the staff pool to show. Admins are a slice of their own rather than part
 * of "has access": they have the console by role, so "has access" and "no access" are
 * questions about staff accounts only — and the query vocabulary has no `or` that could
 * fold admins into the first.
 */
export const ACCESS_FILTERS = ['all', 'granted', 'denied', 'admins'] as const;

export type AccessFilter = (typeof ACCESS_FILTERS)[number];

export type AccessFilters = {
  /** Matched against `username`, anywhere in it, ignoring case. */
  query: string;
  access: AccessFilter;
};

export function emptyAccessFilters(): AccessFilters {
  return { query: '', access: 'all' };
}

export function parseAccessFilters(params: URLSearchParams): AccessFilters {
  const access = params.get(KEYS.access) ?? '';
  return {
    query: (params.get(KEYS.query) ?? '').trim(),
    access: (ACCESS_FILTERS as readonly string[]).includes(access) ? (access as AccessFilter) : 'all',
  };
}

export function parseAccessPage(params: URLSearchParams): number {
  const raw = Number.parseInt(params.get(KEYS.page) ?? '1', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

export function serializeAccessFilters(filters: AccessFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.query) params.set(KEYS.query, filters.query);
  if (filters.access !== 'all') params.set(KEYS.access, filters.access);
  if (page > 1) params.set(KEYS.page, String(page));
  const search = params.toString();
  return search ? `?${search}` : '';
}

/** The number on "Clear all". */
export function activeAccessFilterCount(filters: AccessFilters): number {
  return (filters.query ? 1 : 0) + (filters.access !== 'all' ? 1 : 0);
}
