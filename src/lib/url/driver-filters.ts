import { parsePreset, resolveRange, type DateRange, type RangePreset } from '@/lib/ops/date-range';
import { DRIVER_STATUSES, type DriverStatus } from '@/lib/ops/drivers';

/**
 * The state of the Drivers screens, in the query string — the same bargain as the
 * restaurant list (lib/url/restaurant-filters.ts): a link pasted into the team chat opens
 * the same list, and Back undoes a filter. Every value is untrusted and narrowed on the
 * way in; every default is left out on the way back.
 *
 * Pages are addressed by `?id=` rather than a path segment because the app is a static
 * export (see next.config.ts).
 */

const PAGE_KEY = 'page';

const KEYS = {
  query: 'q',
  region: 'region',
  status: 'status',
  range: 'range',
} as const;

function oneOf<T extends string>(value: string | null, members: readonly T[]): T | '' {
  return value && (members as readonly string[]).includes(value) ? (value as T) : '';
}

function finish(params: URLSearchParams, page: number): string {
  if (page > 1) params.set(PAGE_KEY, String(page));
  const search = params.toString();
  return search ? `?${search}` : '';
}

/* ---- routes ---------------------------------------------------------------- */

export const DRIVERS_PATH = '/drivers';

export function driverHref(id: string, range?: DriverRange): string {
  const params = new URLSearchParams({ id });
  if (range && range !== DEFAULT_DRIVER_RANGE) params.set(KEYS.range, range);
  return `/drivers/detail?${params.toString()}`;
}

/* ---- the list --------------------------------------------------------------- */

export type DriverFilters = {
  /** Matched in the browser against name, username, id and phone — the whole fleet in
   * scope is loaded (see lib/services/drivers.ts), so there is no search field to pick. */
  query: string;
  /** City objectId, or '' for any. */
  region: string;
  status: DriverStatus | '';
};

export function emptyDriverFilters(): DriverFilters {
  return { query: '', region: '', status: '' };
}

export function parseDriverFilters(params: URLSearchParams): DriverFilters {
  return {
    query: (params.get(KEYS.query) ?? '').trim(),
    region: params.get(KEYS.region) ?? '',
    status: oneOf(params.get(KEYS.status), DRIVER_STATUSES),
  };
}

export function serializeDriverFilters(filters: DriverFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.query) params.set(KEYS.query, filters.query);
  if (filters.region) params.set(KEYS.region, filters.region);
  if (filters.status) params.set(KEYS.status, filters.status);
  return finish(params, page);
}

export function parseDriverListPage(params: URLSearchParams): number {
  const raw = Number.parseInt(params.get(PAGE_KEY) ?? '1', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

/**
 * Pins a staff account's list to its own region, whatever the URL asked for — applied
 * where the filters are read, as `confineRestaurantsToRegion` does, and with the same
 * caveat: a UX boundary. Nothing on the server scopes `getUsers` or a `_User` read by
 * region.
 */
export function confineDriversToRegion(filters: DriverFilters, pinnedRegion: string): DriverFilters {
  if (!pinnedRegion || filters.region === pinnedRegion) return filters;
  return { ...filters, region: pinnedRegion };
}

/** The number on "Clear all" — a pinned region isn't a filter the user applied. */
export function activeDriverFilterCount(filters: DriverFilters, pinnedRegion = ''): number {
  let count = 0;
  if (filters.query) count += 1;
  if (filters.region && filters.region !== pinnedRegion) count += 1;
  if (filters.status) count += 1;
  return count;
}

/* ---- one driver -------------------------------------------------------------- */

/**
 * The periods the deliveries panel offers.
 *
 * A subset of the board's presets: no `all` and no `custom`, because this panel reads
 * every order in the period into the browser to add its money up (see
 * `listDriverDeliveries`), and "every order this driver has ever done" is not a page —
 * the orders board, which pages, is one link away.
 */
export const DRIVER_RANGES = ['today', 'yesterday', 'week', 'month'] as const;

export type DriverRange = (typeof DRIVER_RANGES)[number];

export const DEFAULT_DRIVER_RANGE: DriverRange = 'today';

function isDriverRange(preset: RangePreset): preset is DriverRange {
  return (DRIVER_RANGES as readonly string[]).includes(preset);
}

/** One driver's page. Not `DriverView` — that name is lib/ops/drivers.ts's, for a driver
 * as the screens describe them. */
export type DriverPage = {
  id: string;
  preset: DriverRange;
  /** The preset resolved to instants, on the Algiers clock. */
  range: DateRange;
};

export function parseDriverPage(params: URLSearchParams): DriverPage {
  const preset = parsePreset(params.get(KEYS.range));
  const used = isDriverRange(preset) ? preset : DEFAULT_DRIVER_RANGE;
  return { id: params.get('id') ?? '', preset: used, range: resolveRange(used) };
}

export function serializeDriverPage(view: Pick<DriverPage, 'id' | 'preset'>): string {
  const params = new URLSearchParams({ id: view.id });
  if (view.preset !== DEFAULT_DRIVER_RANGE) params.set(KEYS.range, view.preset);
  return `?${params.toString()}`;
}
