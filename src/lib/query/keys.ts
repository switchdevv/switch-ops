import type { OrderFilters } from '@/lib/url/order-filters';

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
    range: rangeKey(filters),
  };
}

/** The subset the pipeline tallies and the unassigned count share — the stage and the
 * driver toggle are excluded because those two queries define their own. */
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
  cities: {
    all: ['cities'] as const,
    list: () => ['cities', 'list'] as const,
  },
  orders: {
    all: ['orders'] as const,
    list: (filters: OrderFilters, page: number) =>
      ['orders', 'list', listKey(filters), page] as const,
    stages: (filters: OrderFilters) => ['orders', 'stages', scopeKey(filters)] as const,
    needsDriver: (filters: OrderFilters) =>
      ['orders', 'needs-driver', scopeKey(filters)] as const,
  },
  /** The live map. Keyed by region only: its time window slides with the clock and is
   * resolved inside the query (see lib/services/dispatch.ts), not part of its identity. */
  dispatch: {
    all: ['dispatch'] as const,
    orders: (region: string) => ['dispatch', 'orders', { region }] as const,
    drivers: (region: string) => ['dispatch', 'drivers', { region }] as const,
  },
} as const;
