import { MANAGER_STATUSES, type ManagerStatus } from '@/lib/ops/managers';

/**
 * The state of the Managers screens, in the query string — the Drivers list's bargain
 * (lib/url/driver-filters.ts): a pasted link opens the same list, Back undoes a filter, every
 * value is narrowed on the way in and every default left out on the way back.
 */

const PAGE_KEY = 'page';

const KEYS = {
  query: 'q',
  region: 'region',
  status: 'status',
} as const;

function oneOf<T extends string>(value: string | null, members: readonly T[]): T | '' {
  return value && (members as readonly string[]).includes(value) ? (value as T) : '';
}

export const MANAGERS_PATH = '/managers';

export function managerHref(id: string): string {
  return `/managers/detail?${new URLSearchParams({ id }).toString()}`;
}

export type ManagerFilters = {
  /** Matched in the browser against name, username, id, phone and restaurant. */
  query: string;
  /** City objectId, or '' for any. */
  region: string;
  status: ManagerStatus | '';
};

export function emptyManagerFilters(): ManagerFilters {
  return { query: '', region: '', status: '' };
}

export function parseManagerFilters(params: URLSearchParams): ManagerFilters {
  return {
    query: (params.get(KEYS.query) ?? '').trim(),
    region: params.get(KEYS.region) ?? '',
    status: oneOf(params.get(KEYS.status), MANAGER_STATUSES),
  };
}

export function serializeManagerFilters(filters: ManagerFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.query) params.set(KEYS.query, filters.query);
  if (filters.region) params.set(KEYS.region, filters.region);
  if (filters.status) params.set(KEYS.status, filters.status);
  if (page > 1) params.set(PAGE_KEY, String(page));
  const search = params.toString();
  return search ? `?${search}` : '';
}

export function parseManagerListPage(params: URLSearchParams): number {
  const raw = Number.parseInt(params.get(PAGE_KEY) ?? '1', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

/** Pins a staff account's list to its own region — see `confineDriversToRegion`. */
export function confineManagersToRegion(filters: ManagerFilters, pinnedRegion: string): ManagerFilters {
  if (!pinnedRegion || filters.region === pinnedRegion) return filters;
  return { ...filters, region: pinnedRegion };
}

/** The number on "Clear all" — a pinned region isn't a filter the user applied. */
export function activeManagerFilterCount(filters: ManagerFilters, pinnedRegion = ''): number {
  let count = 0;
  if (filters.query) count += 1;
  if (filters.region && filters.region !== pinnedRegion) count += 1;
  if (filters.status) count += 1;
  return count;
}
