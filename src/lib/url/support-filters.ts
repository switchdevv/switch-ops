import { parsePreset, resolveRange, type DateRange, type RangePreset } from '@/lib/ops/date-range';
import { SENDER_APPS, type SenderApp } from '@/lib/ops/support';

/**
 * The support inbox's state, in the query string — the same bargain as the other lists: a
 * link pasted into the team chat opens the same message in the same list, and Back undoes a
 * filter. `id` is the message open in the reader, so "look at this one" is a link.
 */

export const SUPPORT_PATH = '/support';

/**
 * What the search box matches. Name, email and phone are what switch-dashboard's Support
 * page offered, with its id; the message text and the sender's account id are added — the
 * first is what someone remembers ("the one about the refund"), the second is what gets
 * copied out of the orders board.
 */
export const SUPPORT_SEARCH_FIELDS = ['fullname', 'phone', 'email', 'message', 'objectId', 'user'] as const;

export type SupportSearchField = (typeof SUPPORT_SEARCH_FIELDS)[number];

/** The periods offered. No `custom`: an inbox is read from the top, and "all" is one tap. */
export const SUPPORT_RANGES = ['today', 'week', 'month', 'all'] as const;

export type SupportRange = (typeof SUPPORT_RANGES)[number];

/** Everything, like the dashboard — a support message is often answered days later. */
export const DEFAULT_SUPPORT_RANGE: SupportRange = 'all';

export type SupportFilters = {
  query: string;
  field: SupportSearchField;
  /** City objectId of the sender's region, or '' for any. */
  region: string;
  app: SenderApp | '';
  range: DateRange;
  /** Only messages this account hasn't opened on this browser. */
  unread: boolean;
};

const KEYS = {
  query: 'q',
  field: 'by',
  region: 'region',
  app: 'app',
  range: 'range',
  unread: 'unread',
  id: 'id',
  page: 'page',
} as const;

function oneOf<T extends string>(value: string | null, members: readonly T[]): T | '' {
  return value && (members as readonly string[]).includes(value) ? (value as T) : '';
}

function isSupportRange(preset: RangePreset): preset is SupportRange {
  return (SUPPORT_RANGES as readonly string[]).includes(preset);
}

export function emptySupportFilters(): SupportFilters {
  return {
    query: '',
    field: 'fullname',
    region: '',
    app: '',
    range: resolveRange(DEFAULT_SUPPORT_RANGE),
    unread: false,
  };
}

export function parseSupportFilters(params: URLSearchParams): SupportFilters {
  // `parsePreset` answers 'today' for a missing value; this list's default is 'all'.
  const rawRange = params.get(KEYS.range);
  const preset = rawRange ? parsePreset(rawRange) : DEFAULT_SUPPORT_RANGE;
  return {
    query: (params.get(KEYS.query) ?? '').trim(),
    field: oneOf(params.get(KEYS.field), SUPPORT_SEARCH_FIELDS) || 'fullname',
    region: params.get(KEYS.region) ?? '',
    app: oneOf(params.get(KEYS.app), SENDER_APPS),
    range: resolveRange(isSupportRange(preset) ? preset : DEFAULT_SUPPORT_RANGE),
    unread: params.get(KEYS.unread) === '1',
  };
}

export function parseSupportPage(params: URLSearchParams): number {
  const raw = Number.parseInt(params.get(KEYS.page) ?? '1', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

export function parseSelectedMessage(params: URLSearchParams): string {
  return params.get(KEYS.id) ?? '';
}

/** Back to a query string, every default left out. */
export function serializeSupportFilters(filters: SupportFilters, page: number, selectedId = ''): string {
  const params = new URLSearchParams();
  if (filters.query) {
    params.set(KEYS.query, filters.query);
    if (filters.field !== 'fullname') params.set(KEYS.field, filters.field);
  }
  if (filters.region) params.set(KEYS.region, filters.region);
  if (filters.app) params.set(KEYS.app, filters.app);
  if (filters.range.preset !== DEFAULT_SUPPORT_RANGE) params.set(KEYS.range, filters.range.preset);
  if (filters.unread) params.set(KEYS.unread, '1');
  if (page > 1) params.set(KEYS.page, String(page));
  if (selectedId) params.set(KEYS.id, selectedId);
  const search = params.toString();
  return search ? `?${search}` : '';
}

/** One message, opened in the inbox over every date. */
export function supportMessageHref(id: string): string {
  return `${SUPPORT_PATH}?${KEYS.id}=${encodeURIComponent(id)}`;
}

/** The inbox showing only what this account hasn't opened — where the bell and a
 * "several arrived" alert send you. A query string of its own, so the inbox doesn't
 * restore the list as it was last left (see SupportScreen). */
export function supportUnreadHref(): string {
  return `${SUPPORT_PATH}?${KEYS.unread}=1`;
}

/**
 * Pins a staff account's inbox to its own region — applied where the filters are read, as
 * everywhere else in this console, and with the same caveat: a UX boundary. The `Message`
 * class permissions let any Staff session read every row.
 */
export function confineSupportToRegion(filters: SupportFilters, pinnedRegion: string): SupportFilters {
  if (!pinnedRegion || filters.region === pinnedRegion) return filters;
  return { ...filters, region: pinnedRegion };
}

/** The number on "Clear all". Unread is a view, not a filter, so it isn't counted. */
export function activeSupportFilterCount(filters: SupportFilters, pinnedRegion = ''): number {
  let count = 0;
  if (filters.query) count += 1;
  if (filters.region && filters.region !== pinnedRegion) count += 1;
  if (filters.app) count += 1;
  if (filters.range.preset !== DEFAULT_SUPPORT_RANGE) count += 1;
  return count;
}
