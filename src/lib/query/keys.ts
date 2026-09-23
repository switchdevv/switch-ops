import type { DateRange } from '@/lib/ops/date-range';
import type { AccessFilters } from '@/lib/url/access-filters';
import type { CustomerFilters } from '@/lib/url/customer-filters';
import type { OrderFilters } from '@/lib/url/order-filters';
import type { SupportFilters } from '@/lib/url/support-filters';
import type {
  MenuFilters,
  ProductFilters,
  RestaurantFilters,
  ReviewFilters,
} from '@/lib/url/restaurant-filters';

/**
 * The slice of a filter set that identifies a query for caching.
 *
 * A `DateRange` carries live `Date` objects, and React Query hashes keys with
 * `JSON.stringify` — two structurally identical ranges built a millisecond apart
 * serialise the same, but keeping the Dates in the key would still put two mutable
 * objects in a cache index. The ISO pair plus the preset says everything that
 * distinguishes one range from another, and reads legibly in the devtools.
 */
function rangeKey(filters: OrderFilters) {
  return { preset: filters.range.preset, from: filters.range.from, to: filters.range.to };
}

/** Everything that changes *which rows* come back. */
function listKey(filters: OrderFilters) {
  return {
    query: filters.query,
    field: filters.field,
    region: filters.region,
    type: filters.type,
    stage: filters.stage,
    needsDriver: filters.needsDriver,
    calls: filters.calls,
    range: rangeKey(filters),
  };
}

/** The subset the pipeline tallies, the unassigned count and the calls-due counts share —
 * the stage, the driver toggle and the calls filter are excluded because those queries
 * define their own. */
function scopeKey(filters: OrderFilters) {
  return {
    query: filters.query,
    field: filters.field,
    region: filters.region,
    type: filters.type,
    range: rangeKey(filters),
  };
}

/**
 * Single source of truth for cache identity. Keys are never written inline in a hook or
 * component — every query that touches the cache imports from here, so invalidation
 * stays obvious as more resources are added.
 */
export const queryKeys = {
  session: ['session'] as const,
  /** The signed-in account's row, re-read from the server (see hooks/use-access.ts).
   * Keyed by objectId rather than being a singleton so signing in as a second account
   * can't inherit the first one's answer out of the cache. */
  access: {
    current: (objectId: string) => ['access', 'current', objectId] as const,
  },
  /** The staff pool on /access. Pages on the server, so the filters are part of the key. */
  staff: {
    all: ['staff'] as const,
    list: (filters: AccessFilters, page: number) => ['staff', 'list', filters, page] as const,
  },
  cities: {
    all: ['cities'] as const,
    list: () => ['cities', 'list'] as const,
  },
  /**
   * `queued` is the orders lined up behind a busy driver, which the needs-a-driver count
   * and filter leave out — part of the key because it changes which rows come back.
   * Callers pass it sorted, so the same set is the same key.
   */
  orders: {
    all: ['orders'] as const,
    list: (filters: OrderFilters, page: number, queued: readonly string[]) =>
      ['orders', 'list', listKey(filters), page, { queued }] as const,
    stages: (filters: OrderFilters) => ['orders', 'stages', scopeKey(filters)] as const,
    needsDriver: (filters: OrderFilters, queued: readonly string[]) =>
      ['orders', 'needs-driver', scopeKey(filters), { queued }] as const,
    /** How many placed orders still wait on each call — the pipeline's "To call" numbers. */
    calls: (filters: OrderFilters) => ['orders', 'calls', scopeKey(filters)] as const,
    /** One customer's orders and their tallies, on the Customers page. Under `orders` so an
     * order action taken there (confirm, edit, unassign) re-reads them with the board. */
    customer: (userId: string, page: number, region: string) =>
      ['orders', 'customer', userId, page, { region }] as const,
    customerStats: (userId: string, region: string) => ['orders', 'customer-stats', userId, { region }] as const,
  },
  /** The live map. Keyed by region only: its time window slides with the clock and is
   * resolved inside the query (see lib/services/dispatch.ts), not part of its identity. */
  dispatch: {
    all: ['dispatch'] as const,
    orders: (region: string) => ['dispatch', 'orders', { region }] as const,
    drivers: (region: string) => ['dispatch', 'drivers', { region }] as const,
    /** The open order's basket and promo, read on their own (see `getOrderContents`). Under
     * `dispatch` so whatever refreshes the map refreshes it too. */
    contents: (orderId: string) => ['dispatch', 'contents', orderId] as const,
  },
  /** The driver queue (`DispatchQueue`), read by the map and the board alike. */
  queue: {
    all: ['queue'] as const,
    list: (region: string) => ['queue', 'list', { region }] as const,
  },
  /**
   * The catalogue: restaurants, their menus, dishes and reviews. The filter objects are
   * plain strings and booleans (see lib/url/restaurant-filters.ts), so they go into the key
   * as they are.
   */
  restaurants: {
    all: ['restaurants'] as const,
    list: (filters: RestaurantFilters, page: number) => ['restaurants', 'list', filters, page] as const,
    detail: (id: string) => ['restaurants', 'detail', id] as const,
  },
  categories: {
    all: ['categories'] as const,
    list: () => ['categories', 'list'] as const,
  },
  menus: {
    all: ['menus'] as const,
    list: (restaurantId: string, filters: MenuFilters, page: number) =>
      ['menus', 'list', restaurantId, filters, page] as const,
    detail: (id: string) => ['menus', 'detail', id] as const,
  },
  products: {
    all: ['products'] as const,
    list: (menuId: string, filters: ProductFilters, page: number) =>
      ['products', 'list', menuId, filters, page] as const,
    detail: (id: string) => ['products', 'detail', id] as const,
    suggestions: () => ['products', 'supplement-suggestions'] as const,
  },
  reviews: {
    all: ['reviews'] as const,
    list: (restaurantId: string, filters: ReviewFilters, page: number) =>
      ['reviews', 'list', restaurantId, filters, page] as const,
  },
  /**
   * The fleet. The list is keyed by region alone — every driver in scope is read at once
   * and the search, the status counts and the sorting all happen in the browser, so a
   * filter change must not become a new cache entry (and a new request).
   *
   * `detail` is the row the screens render; `account` is the same driver read through
   * `getUsers` for the fields a session read can't see. Separate keys because they are
   * separate reads with different costs — the account one is a cloud call, made only when
   * a form or a write needs it.
   */
  drivers: {
    all: ['drivers'] as const,
    list: (region: string) => ['drivers', 'list', { region }] as const,
    detail: (id: string) => ['drivers', 'detail', id] as const,
    account: (id: string) => ['drivers', 'account', id] as const,
    /** The range goes in whole and comes out as its preset and ISO dates — the Dates stay
     * out of the key, for the reason `rangeKey` gives above. */
    deliveries: (id: string, range: Pick<DateRange, 'preset' | 'from' | 'to'>, region: string) =>
      ['drivers', 'deliveries', id, { preset: range.preset, from: range.from, to: range.to }, { region }] as const,
  },
  /**
   * Customer accounts. `list` pages on the server, so the filters are part of it; `account`
   * is the `getUsers` read (email, cart, promos) the detail page and every form use.
   */
  customers: {
    all: ['customers'] as const,
    list: (filters: CustomerFilters, page: number, hideStaff: boolean) =>
      ['customers', 'list', filters, page, { hideStaff }] as const,
    account: (id: string) => ['customers', 'account', id] as const,
    addresses: (id: string) => ['customers', 'addresses', id] as const,
  },
  /** An account's apps, read through `getUsers` when the App access dialog opens. */
  appAccess: (userId: string) => ['app-access', userId] as const,
  /** An account looked up by id before being made a restaurant's manager. */
  managerCandidate: (userId: string) => ['manager-candidate', userId] as const,
  /**
   * The support inbox. The list's filters go in as their plain values and the period as its
   * preset and ISO dates, for the reason `rangeKey` gives. `marks` is the read-marks snapshot
   * an Unread list was asked with — part of which rows come back — and null otherwise.
   */
  support: {
    all: ['support'] as const,
    list: (filters: SupportFilters, page: number, marks: { since: number; ids: readonly string[] } | null) =>
      [
        'support',
        'list',
        { ...filters, range: { preset: filters.range.preset, from: filters.range.from, to: filters.range.to } },
        page,
        marks,
      ] as const,
    /** Keyed on the read marks' `since` alone, not their ids: a message opened is taken off
     * the number in the browser (`unreadNow`), rather than re-asking the server. */
    unread: (filters: SupportFilters, since: number) =>
      [
        'support',
        'unread',
        { ...filters, unread: false, range: { preset: filters.range.preset, from: filters.range.from, to: filters.range.to } },
        { since },
      ] as const,
    detail: (id: string) => ['support', 'detail', id] as const,
    history: (userId: string) => ['support', 'history', userId] as const,
    orders: (userId: string) => ['support', 'orders', userId] as const,
    /** A driver's deliveries up to the moment of one message — `before` is part of the key
     * because the read is anchored there, not on now. */
    deliveries: (driverId: string, before: string) => ['support', 'deliveries', driverId, { before }] as const,
  },
  /**
   * Restaurant managers. Built like `drivers`: the list is keyed by region alone and filtered
   * in the browser; `account` is the `getUsers` read. `restaurantOptions` is the assign
   * dialog's search.
   */
  managers: {
    all: ['managers'] as const,
    list: (region: string) => ['managers', 'list', { region }] as const,
    detail: (id: string) => ['managers', 'detail', id] as const,
    account: (id: string) => ['managers', 'account', id] as const,
    restaurantOptions: (region: string, query: string) => ['managers', 'restaurant-options', { region, query }] as const,
  },
} as const;
