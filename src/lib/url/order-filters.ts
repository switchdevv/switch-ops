import { parsePreset, resolveRange, type DateRange, type RangePreset } from '@/lib/ops/date-range';
import { ORDER_STAGES, type OrderStage } from '@/lib/ops/order-status';
import type { DeliveryType } from '@/types/order';

/**
 * Which field the search box matches against. Same four the staff dashboard offers
 * (switch-dashboard/src/pages/Orders/Orders.jsx), because they are the four ids anyone
 * ever pastes in: the order number off a receipt, and a customer, driver or restaurant
 * id copied out of another screen.
 */
export const SEARCH_FIELDS = ['objectId', 'user', 'driver', 'restaurant'] as const;

export type SearchField = (typeof SEARCH_FIELDS)[number];

export type OrderFilters = {
  query: string;
  field: SearchField;
  /** City objectId, or '' for any. */
  region: string;
  type: DeliveryType | '';
  stage: OrderStage | '';
  /**
   * Open delivery orders with nobody carrying them. Three constraints, not one — see
   * `isUnassignedDelivery` for why a bare `driver == null` is the wrong set.
   */
  needsDriver: boolean;
  range: DateRange;
};

/**
 * The whole board's state lives in the query string.
 *
 * That is a deliberate ops feature, not a routing detail: a dispatcher who finds a
 * stuck order pastes the URL into the team chat and the next person sees exactly the
 * same list. It also means the browser's Back button undoes a filter, which is what
 * everyone tries first.
 */
export const ORDER_PARAM_KEYS = {
  query: 'q',
  field: 'by',
  region: 'region',
  type: 'type',
  stage: 'stage',
  needsDriver: 'nodriver',
  range: 'range',
  from: 'from',
  to: 'to',
  page: 'page',
} as const;

export const DEFAULT_PRESET: RangePreset = 'today';

function isSearchField(value: string | null): value is SearchField {
  return !!value && (SEARCH_FIELDS as readonly string[]).includes(value);
}

function isStage(value: string | null): value is OrderStage {
  return !!value && (ORDER_STAGES as readonly string[]).includes(value);
}

function isDeliveryType(value: string | null): value is DeliveryType {
  return value === 'delivery' || value === 'pickup';
}

/** Every value here is untrusted — it came out of a URL someone may have hand-edited —
 * so each one is narrowed to a known member rather than cast. */
export function parseOrderFilters(params: URLSearchParams): OrderFilters {
  const fieldParam = params.get(ORDER_PARAM_KEYS.field);
  const typeParam = params.get(ORDER_PARAM_KEYS.type);
  const stageParam = params.get(ORDER_PARAM_KEYS.stage);

  return {
    query: (params.get(ORDER_PARAM_KEYS.query) ?? '').trim(),
    field: isSearchField(fieldParam) ? fieldParam : 'objectId',
    region: params.get(ORDER_PARAM_KEYS.region) ?? '',
    type: isDeliveryType(typeParam) ? typeParam : '',
    stage: isStage(stageParam) ? stageParam : '',
    needsDriver: params.get(ORDER_PARAM_KEYS.needsDriver) === '1',
    range: resolveRange(
      parsePreset(params.get(ORDER_PARAM_KEYS.range)),
      params.get(ORDER_PARAM_KEYS.from),
      params.get(ORDER_PARAM_KEYS.to),
    ),
  };
}

export function parsePage(params: URLSearchParams): number {
  const raw = Number.parseInt(params.get(ORDER_PARAM_KEYS.page) ?? '1', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

/**
 * Serialises filters back to a query string, omitting every default.
 *
 * Omission is what keeps the shareable URL readable: `?stage=new` says one thing, while
 * `?q=&by=objectId&region=&type=&stage=new&nodriver=0&range=today&page=1` says the same
 * thing and looks like a bug report.
 */
export function serializeOrderFilters(filters: OrderFilters, page: number): string {
  const params = new URLSearchParams();

  if (filters.query) {
    params.set(ORDER_PARAM_KEYS.query, filters.query);
    // Only meaningful alongside a query, and 'objectId' is the default — writing it
    // unconditionally would put `by=objectId` in every URL anyone ever shares.
    if (filters.field !== 'objectId') params.set(ORDER_PARAM_KEYS.field, filters.field);
  }
  if (filters.region) params.set(ORDER_PARAM_KEYS.region, filters.region);
  if (filters.type) params.set(ORDER_PARAM_KEYS.type, filters.type);
  if (filters.stage) params.set(ORDER_PARAM_KEYS.stage, filters.stage);
  if (filters.needsDriver) params.set(ORDER_PARAM_KEYS.needsDriver, '1');

  if (filters.range.preset !== DEFAULT_PRESET) {
    params.set(ORDER_PARAM_KEYS.range, filters.range.preset);
    if (filters.range.preset === 'custom') {
      params.set(ORDER_PARAM_KEYS.from, filters.range.from);
      params.set(ORDER_PARAM_KEYS.to, filters.range.to);
    }
  }
  if (page > 1) params.set(ORDER_PARAM_KEYS.page, String(page));

  const search = params.toString();
  return search ? `?${search}` : '';
}

/**
 * A link to the board, searching for one id over every date.
 *
 * `all` rather than the default "today" because the caller is the live map, which holds
 * orders placed before midnight, and a board that answered "no orders match" for an
 * order plainly on the screen next door would read as a broken link.
 */
export function ordersHref(field: SearchField, id: string): string {
  const params = new URLSearchParams();
  params.set(ORDER_PARAM_KEYS.query, id);
  if (field !== 'objectId') params.set(ORDER_PARAM_KEYS.field, field);
  params.set(ORDER_PARAM_KEYS.range, 'all');
  return `/orders?${params.toString()}`;
}

export function emptyFilters(): OrderFilters {
  return {
    query: '',
    field: 'objectId',
    region: '',
    type: '',
    stage: '',
    needsDriver: false,
    range: resolveRange(DEFAULT_PRESET),
  };
}

/**
 * Pins the region to the one a staff account may look at, whatever the URL says.
 *
 * Applied where the filters are read rather than where they are written, which is what
 * makes it hold: `?region=` is a query string, and a hand-edited or shared URL is the
 * obvious way to ask this board for somebody else's city. Overriding on the way in
 * means every consumer of the filters — the list, the five pipeline tallies, the
 * unassigned count — is scoped by construction instead of each remembering to be.
 *
 * `''` (an admin) pins nothing and returns the filters untouched, including the same
 * object, so the memo downstream doesn't invalidate on every render.
 *
 * This is a UX boundary, not a security one — the same caveat as RequireAuth. A
 * determined staff account can still ask Parse directly; what stops that is the
 * backend's CLP, not a query string.
 */
export function confineToRegion(filters: OrderFilters, pinnedRegion: string): OrderFilters {
  if (!pinnedRegion || filters.region === pinnedRegion) return filters;
  return { ...filters, region: pinnedRegion };
}

/**
 * How many filters are narrowing the list right now — the number on the "clear all"
 * button. The date is counted only when it isn't the default day, because "today" is
 * the board's resting state rather than something the user switched on.
 *
 * `pinnedRegion` is excluded for the same reason: a staff account's region is where the
 * board starts, not a filter they applied, and counting it would leave a permanent
 * "1 filter active" next to a Clear button that can't clear it.
 */
export function activeFilterCount(filters: OrderFilters, pinnedRegion = ''): number {
  let count = 0;
  if (filters.query) count += 1;
  if (filters.region && filters.region !== pinnedRegion) count += 1;
  if (filters.type) count += 1;
  if (filters.stage) count += 1;
  if (filters.needsDriver) count += 1;
  if (filters.range.preset !== DEFAULT_PRESET) count += 1;
  return count;
}
