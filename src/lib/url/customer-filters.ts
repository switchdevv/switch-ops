import { CUSTOMER_STATUSES, type CustomerStatus } from '@/lib/ops/customers';

/**
 * The state of the Customers screens, in the query string — the same bargain as the
 * restaurant and driver lists: a pasted link opens the same list, Back undoes a filter.
 * Every value is untrusted and narrowed on the way in; every default is left out on the way
 * back. Pages are addressed by `?id=` because the app is a static export.
 */

const KEYS = {
  query: 'q',
  field: 'by',
  region: 'region',
  status: 'status',
  sort: 'sort',
  page: 'page',
} as const;

function oneOf<T extends string>(value: string | null, members: readonly T[]): T | '' {
  return value && (members as readonly string[]).includes(value) ? (value as T) : '';
}

function pageOf(params: URLSearchParams): number {
  const raw = Number.parseInt(params.get(KEYS.page) ?? '1', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

/* ---- routes ---------------------------------------------------------------- */

export const CUSTOMERS_PATH = '/customers';

export function customerHref(id: string): string {
  return `${CUSTOMERS_PATH}/detail?${new URLSearchParams({ id }).toString()}`;
}

/* ---- the list --------------------------------------------------------------- */

/**
 * What the search box matches. The same five the staff dashboard's Users page offers, the
 * ids and details someone on the phone with a customer actually has.
 *
 * `email` is the odd one out: Parse hides the column from a session read, so an email
 * search goes through `getUsers` instead (see lib/services/customers.ts).
 */
export const CUSTOMER_SEARCH_FIELDS = ['name', 'phone', 'email', 'username', 'objectId'] as const;

export type CustomerSearchField = (typeof CUSTOMER_SEARCH_FIELDS)[number];

export const CUSTOMER_SORTS = ['newest', 'name'] as const;

export type CustomerSort = (typeof CUSTOMER_SORTS)[number];

export type CustomerFilters = {
  query: string;
  field: CustomerSearchField;
  /** City objectId, or '' for any. */
  region: string;
  status: CustomerStatus | '';
  sort: CustomerSort;
};

export function emptyCustomerFilters(): CustomerFilters {
  return { query: '', field: 'phone', region: '', status: '', sort: 'newest' };
}

export function parseCustomerFilters(params: URLSearchParams): CustomerFilters {
  const empty = emptyCustomerFilters();
  return {
    query: (params.get(KEYS.query) ?? '').trim(),
    field: oneOf(params.get(KEYS.field), CUSTOMER_SEARCH_FIELDS) || empty.field,
    region: params.get(KEYS.region) ?? '',
    status: oneOf(params.get(KEYS.status), CUSTOMER_STATUSES),
    sort: oneOf(params.get(KEYS.sort), CUSTOMER_SORTS) || empty.sort,
  };
}

export function serializeCustomerFilters(filters: CustomerFilters, page: number): string {
  const empty = emptyCustomerFilters();
  const params = new URLSearchParams();
  if (filters.query) params.set(KEYS.query, filters.query);
  // Kept even without a query: the chosen field is what the next search will use.
  if (filters.field !== empty.field) params.set(KEYS.field, filters.field);
  if (filters.region) params.set(KEYS.region, filters.region);
  if (filters.status) params.set(KEYS.status, filters.status);
  if (filters.sort !== empty.sort) params.set(KEYS.sort, filters.sort);
  if (page > 1) params.set(KEYS.page, String(page));
  const search = params.toString();
  return search ? `?${search}` : '';
}

export function parseCustomerListPage(params: URLSearchParams): number {
  return pageOf(params);
}

/**
 * Pins a staff account's list to its own region, whatever the URL asked for — as
 * `confineRestaurantsToRegion` does, with the same caveat: a UX boundary. Nothing on the
 * server scopes `getUsers` or a `_User` read by region.
 */
export function confineCustomersToRegion(filters: CustomerFilters, pinnedRegion: string): CustomerFilters {
  if (!pinnedRegion || filters.region === pinnedRegion) return filters;
  return { ...filters, region: pinnedRegion };
}

/** The number on "Clear all". The search field and the sort aren't filters, and a pinned
 * region isn't one the user applied. */
export function activeCustomerFilterCount(filters: CustomerFilters, pinnedRegion = ''): number {
  let count = 0;
  if (filters.query) count += 1;
  if (filters.region && filters.region !== pinnedRegion) count += 1;
  if (filters.status) count += 1;
  return count;
}

/* ---- one customer ------------------------------------------------------------ */

/** One customer's page: whose, and which page of their orders. */
export type CustomerView = { id: string; page: number };

export function parseCustomerView(params: URLSearchParams): CustomerView {
  return { id: params.get('id') ?? '', page: pageOf(params) };
}

export function serializeCustomerView(view: CustomerView): string {
  const params = new URLSearchParams({ id: view.id });
  if (view.page > 1) params.set(KEYS.page, String(view.page));
  return `?${params.toString()}`;
}
