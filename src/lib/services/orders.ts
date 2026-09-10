import { count, findWithCount, pointer, type PageResult, type QueryParam } from '@/lib/parse/query';
import { ORDER_STAGES, STAGE_STATUS, type OrderStage } from '@/lib/ops/order-status';
import type { OrderFilters } from '@/lib/url/order-filters';
import type { OrderRow } from '@/types/order';

const COLLECTION = 'Order';

/** Rows per page. Twenty-five fits a 1080p screen at this row height without the pager
 * scrolling out of reach, which is what makes paging feel like paging rather than
 * hunting for the control. */
export const ORDER_PAGE_SIZE = 25;

/**
 * Everything the board renders, resolved server-side in the one request.
 *
 * No `select` narrowing alongside these: combining `select` with `include` is where
 * Parse quietly drops fields, and the failure mode — a blank customer name on some
 * rows and not others — is far worse than the bytes saved.
 */
const INCLUDES: QueryParam[] = [
  { include: 'user' },
  { include: 'driver' },
  { include: 'restaurant' },
  { include: 'city' },
  { include: 'food' },
  { include: 'promo' },
];

/**
 * The constraints shared by the list and by every pipeline tally: the search, the
 * region, the fulfilment type and the date window.
 *
 * Deliberately *not* including the stage or the needs-a-driver toggle — the pipeline
 * counts one stage each, and would count nothing if the caller's own stage filter were
 * already applied.
 */
function baseParams(filters: OrderFilters): QueryParam[] {
  const { query, field, region, type, range } = filters;

  return [
    // An order id is matched from the start, so a half-remembered "…ends in 4f" still
    // finds something when typed from the front. The other three are pointers: an
    // equality against a full objectId is the only match that exists for them.
    query && field === 'objectId' ? { startsWith: { key: 'objectId', value: query } } : {},
    query && field === 'user'
      ? { equalTo: { key: 'user', value: pointer('_User', query) } }
      : {},
    query && field === 'driver'
      ? { equalTo: { key: 'driver', value: pointer('_User', query) } }
      : {},
    query && field === 'restaurant'
      ? { equalTo: { key: 'restaurant', value: pointer('Restaurant', query) } }
      : {},

    region ? { equalTo: { key: 'city', value: pointer('City', region) } } : {},
    type ? { equalTo: { key: 'deliveryType', value: type } } : {},

    range.start ? { greaterThanOrEqualTo: { key: 'createdAt', value: range.start } } : {},
    range.end ? { lessThanOrEqualTo: { key: 'createdAt', value: range.end } } : {},
  ];
}

/**
 * The stage filter, as query constraints.
 *
 * `canceled` is a separate column from `status` (see lib/ops/order-status.ts), so
 * asking for "confirmed" has to say *not canceled* out loud — otherwise a canceled
 * order that had reached status 1 comes back as confirmed. An empty stage adds nothing
 * at all: "any stage" on an operations board means genuinely everything, canceled rows
 * included. Hiding them behind a default nobody set is how a dispatcher ends up certain
 * an order has vanished.
 */
function stageParams(stage: OrderStage | ''): QueryParam[] {
  if (!stage) return [];
  if (stage === 'canceled') return [{ equalTo: { key: 'canceled', value: true } }];
  return [
    { equalTo: { key: 'canceled', value: false } },
    { equalTo: { key: 'status', value: STAGE_STATUS[stage] } },
  ];
}

/** The unset-driver constraint on its own.
 *
 * `equalTo(key, null)` is Parse's way of saying "unset": it compiles to `{driver: null}`
 * in Mongo, which matches rows where the column was never written as well as rows
 * explicitly nulled. (Passing `undefined` instead would silently become
 * `doesNotExist`, which is *not* the same query.) switch-dashboard's own
 * "without driver" checkbox is written exactly this way.
 */
const NO_DRIVER: QueryParam[] = [{ equalTo: { key: 'driver', value: null } }];

/** What "still needs one" adds on top: not canceled, not already delivered. */
const STILL_OPEN: QueryParam[] = [
  { equalTo: { key: 'canceled', value: false } },
  { lessThan: { key: 'status', value: 3 } },
];

/**
 * Composed by hand rather than concatenated, because two of these constrain the same
 * columns and Parse's `equalTo` *overwrites* rather than intersecting — a second
 * `equalTo('canceled', …)` silently replaces the first instead of returning nothing,
 * so the order and the overlap have to be decided here rather than emerge.
 *
 * When a stage is selected it owns `canceled`/`status` outright, and the driver toggle
 * contributes only "nobody is carrying it". That makes "canceled + needs a driver" a
 * coherent (if unusual) question rather than a contradiction resolved by array order.
 */
function listParams(filters: OrderFilters): QueryParam[] {
  const params = [...baseParams(filters)];
  if (filters.needsDriver) {
    params.push(...NO_DRIVER);
    if (!filters.stage) params.push(...STILL_OPEN);
  }
  params.push(...stageParams(filters.stage));
  return params;
}

export type OrdersPage = PageResult<OrderRow>;

/**
 * One page of the board, with the total for the same constraints attached.
 *
 * Newest first, always: an operations queue is read from the top, and any other sort
 * would put the order someone is on the phone about below the fold.
 */
export function listOrders(filters: OrderFilters, page: number): Promise<OrdersPage> {
  return findWithCount<OrderRow>(COLLECTION, [
    ...listParams(filters),
    ...INCLUDES,
    { descending: 'createdAt' },
    { limit: ORDER_PAGE_SIZE },
    { skip: (page - 1) * ORDER_PAGE_SIZE },
  ]);
}

export type StageTallies = Record<OrderStage, number>;

/**
 * How many orders sit in each stage for the current search, region, type and dates.
 *
 * Five parallel counts rather than one grouped query, because this backend has no
 * aggregation cloud function (the same constraint switch-finance works around by
 * summing rows in the browser). Counts are cheap server-side — they never serialise a
 * row — and running them together costs one round-trip's latency, not five.
 */
export async function tallyStages(filters: OrderFilters): Promise<StageTallies> {
  const base = baseParams(filters);
  const counts = await Promise.all(
    ORDER_STAGES.map((stage) => count(COLLECTION, [...base, ...stageParams(stage)])),
  );
  return Object.fromEntries(
    ORDER_STAGES.map((stage, index) => [stage, counts[index]]),
  ) as StageTallies;
}

/**
 * How many open delivery orders have no driver, within the current search/region/dates.
 *
 * Returns 0 without asking the server when the board is filtered to pickups: this count
 * has to pin `deliveryType` to 'delivery', and a second `equalTo` on a column Parse has
 * already constrained overwrites it — so the query would quietly answer a question
 * about deliveries while the user was looking at collections.
 */
export function countNeedsDriver(filters: OrderFilters): Promise<number> {
  if (filters.type === 'pickup') return Promise.resolve(0);
  return count(COLLECTION, [
    ...baseParams(filters),
    { equalTo: { key: 'deliveryType', value: 'delivery' } },
    ...NO_DRIVER,
    ...STILL_OPEN,
  ]);
}
