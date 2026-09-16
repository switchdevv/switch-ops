/**
 * The state of the restaurant screens, in the query string — the same bargain as the
 * orders board (lib/url/order-filters.ts): a link pasted into the team chat opens the same
 * list, and Back undoes a filter. Every value is untrusted and narrowed on the way in; every
 * default is left out on the way back.
 *
 * Pages are addressed by `?id=` rather than a path segment because the app is a static
 * export (see next.config.ts).
 */

const PAGE_KEY = 'page';

function pageParam(params: URLSearchParams): number {
  const raw = Number.parseInt(params.get(PAGE_KEY) ?? '1', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function oneOf<T extends string>(value: string | null, members: readonly T[]): T | '' {
  return value && (members as readonly string[]).includes(value) ? (value as T) : '';
}

function finish(params: URLSearchParams, page: number): string {
  if (page > 1) params.set(PAGE_KEY, String(page));
  const search = params.toString();
  return search ? `?${search}` : '';
}

/* ---- routes ---------------------------------------------------------------- */

export const RESTAURANTS_PATH = '/restaurants';

export function restaurantHref(id: string, tab?: RestaurantTab): string {
  const params = new URLSearchParams({ id });
  if (tab && tab !== DEFAULT_TAB) params.set('tab', tab);
  return `/restaurants/detail?${params.toString()}`;
}

export function newRestaurantHref(): string {
  return '/restaurants/new';
}

export function editRestaurantHref(id: string): string {
  return `/restaurants/edit?${new URLSearchParams({ id }).toString()}`;
}

export function menuHref(menuId: string): string {
  return `/restaurants/menu?${new URLSearchParams({ id: menuId }).toString()}`;
}

/** The dish form — a new dish in `menuId` when `productId` is left out. */
export function productHref(menuId: string, productId?: string): string {
  const params = new URLSearchParams({ menu: menuId });
  if (productId) params.set('id', productId);
  return `/restaurants/product?${params.toString()}`;
}

/* ---- the restaurant list --------------------------------------------------- */

/**
 * What the search box matches. Name and phone are what someone on the phone with a
 * restaurant has; the two ids are what gets pasted from another screen — the manager's
 * being the dashboard's own third option.
 */
export const RESTAURANT_SEARCH_FIELDS = ['name', 'phone', 'objectId', 'manager'] as const;
export type RestaurantSearchField = (typeof RESTAURANT_SEARCH_FIELDS)[number];

/**
 * The three states a restaurant can be in, as a customer would find it:
 *
 * - `live` — on the platform and not paused; whether it is inside its hours right now is
 *   shown on the row, not filtered on, because that changes by the minute.
 * - `paused` — on the platform, but `active` is not on.
 * - `disabled` — taken off the platform (`enabled` is not on), paused or not.
 */
export const RESTAURANT_STATUSES = ['live', 'paused', 'disabled'] as const;
export type RestaurantStatus = (typeof RESTAURANT_STATUSES)[number];

export const RESTAURANT_SORTS = ['name', 'newest'] as const;
export type RestaurantSort = (typeof RESTAURANT_SORTS)[number];

export type RestaurantFilters = {
  query: string;
  field: RestaurantSearchField;
  /** City objectId, or '' for any. */
  region: string;
  /** Category objectId, or '' for any. */
  category: string;
  status: RestaurantStatus | '';
  featuredOnly: boolean;
  sort: RestaurantSort;
};

const LIST_KEYS = {
  query: 'q',
  field: 'by',
  region: 'region',
  category: 'category',
  status: 'status',
  featuredOnly: 'featured',
  sort: 'sort',
} as const;

export function emptyRestaurantFilters(): RestaurantFilters {
  return { query: '', field: 'name', region: '', category: '', status: '', featuredOnly: false, sort: 'name' };
}

export function parseRestaurantFilters(params: URLSearchParams): RestaurantFilters {
  return {
    query: (params.get(LIST_KEYS.query) ?? '').trim(),
    field: oneOf(params.get(LIST_KEYS.field), RESTAURANT_SEARCH_FIELDS) || 'name',
    region: params.get(LIST_KEYS.region) ?? '',
    category: params.get(LIST_KEYS.category) ?? '',
    status: oneOf(params.get(LIST_KEYS.status), RESTAURANT_STATUSES),
    featuredOnly: params.get(LIST_KEYS.featuredOnly) === '1',
    sort: oneOf(params.get(LIST_KEYS.sort), RESTAURANT_SORTS) || 'name',
  };
}

export function serializeRestaurantFilters(filters: RestaurantFilters, page: number): string {
  const params = new URLSearchParams();
  if (filters.query) {
    params.set(LIST_KEYS.query, filters.query);
    if (filters.field !== 'name') params.set(LIST_KEYS.field, filters.field);
  }
  if (filters.region) params.set(LIST_KEYS.region, filters.region);
  if (filters.category) params.set(LIST_KEYS.category, filters.category);
  if (filters.status) params.set(LIST_KEYS.status, filters.status);
  if (filters.featuredOnly) params.set(LIST_KEYS.featuredOnly, '1');
  if (filters.sort !== 'name') params.set(LIST_KEYS.sort, filters.sort);
  return finish(params, page);
}

export function parseListPage(params: URLSearchParams): number {
  return pageParam(params);
}

/**
 * Pins a staff account's list to its own region, whatever the URL asked for — applied where
 * the filters are read, as `confineToRegion` does for the orders board, and with the same
 * caveat: a UX boundary. The catalogue's class permissions let any signed-in account read
 * every restaurant.
 */
export function confineRestaurantsToRegion(filters: RestaurantFilters, pinnedRegion: string): RestaurantFilters {
  if (!pinnedRegion || filters.region === pinnedRegion) return filters;
  return { ...filters, region: pinnedRegion };
}

/** The number on "Clear all" — the pinned region and the default sort don't count. */
export function activeRestaurantFilterCount(filters: RestaurantFilters, pinnedRegion = ''): number {
  let count = 0;
  if (filters.query) count += 1;
  if (filters.region && filters.region !== pinnedRegion) count += 1;
  if (filters.category) count += 1;
  if (filters.status) count += 1;
  if (filters.featuredOnly) count += 1;
  return count;
}

/* ---- one restaurant -------------------------------------------------------- */

export const RESTAURANT_TABS = ['menus', 'reviews', 'info'] as const;
export type RestaurantTab = (typeof RESTAURANT_TABS)[number];
const DEFAULT_TAB: RestaurantTab = 'menus';

export const ENABLED_STATUSES = ['enabled', 'disabled'] as const;
export type EnabledStatus = (typeof ENABLED_STATUSES)[number];

export type MenuFilters = { query: string; status: EnabledStatus | '' };

/** Star ratings, as strings because that is what a URL and a `<select>` both hold. */
export const REVIEW_RATINGS = ['5', '4', '3', '2', '1'] as const;
export type ReviewFilters = { rating: (typeof REVIEW_RATINGS)[number] | '' };

export type RestaurantView = {
  id: string;
  tab: RestaurantTab;
  page: number;
  menus: MenuFilters;
  reviews: ReviewFilters;
};

export function parseRestaurantView(params: URLSearchParams): RestaurantView {
  return {
    id: params.get('id') ?? '',
    tab: oneOf(params.get('tab'), RESTAURANT_TABS) || DEFAULT_TAB,
    page: pageParam(params),
    menus: {
      query: (params.get('q') ?? '').trim(),
      status: oneOf(params.get('status'), ENABLED_STATUSES),
    },
    reviews: { rating: oneOf(params.get('rating'), REVIEW_RATINGS) },
  };
}

/** Only the current tab's filters are written: switching tab is a fresh start, and a
 * leftover `?rating=1` on the menus tab would be a filter nobody can see. */
export function serializeRestaurantView(view: RestaurantView): string {
  const params = new URLSearchParams({ id: view.id });
  if (view.tab !== DEFAULT_TAB) params.set('tab', view.tab);
  if (view.tab === 'menus') {
    if (view.menus.query) params.set('q', view.menus.query);
    if (view.menus.status) params.set('status', view.menus.status);
  }
  if (view.tab === 'reviews' && view.reviews.rating) params.set('rating', view.reviews.rating);
  return finish(params, view.tab === 'info' ? 1 : view.page);
}

/* ---- one menu's dishes ----------------------------------------------------- */

export const PRODUCT_SEARCH_FIELDS = ['name', 'objectId'] as const;
export type ProductSearchField = (typeof PRODUCT_SEARCH_FIELDS)[number];

export type ProductFilters = {
  query: string;
  field: ProductSearchField;
  status: EnabledStatus | '';
};

export type MenuView = { id: string; page: number; filters: ProductFilters };

export function parseMenuView(params: URLSearchParams): MenuView {
  return {
    id: params.get('id') ?? '',
    page: pageParam(params),
    filters: {
      query: (params.get('q') ?? '').trim(),
      field: oneOf(params.get('by'), PRODUCT_SEARCH_FIELDS) || 'name',
      status: oneOf(params.get('status'), ENABLED_STATUSES),
    },
  };
}

export function serializeMenuView(view: MenuView): string {
  const params = new URLSearchParams({ id: view.id });
  if (view.filters.query) {
    params.set('q', view.filters.query);
    if (view.filters.field !== 'name') params.set('by', view.filters.field);
  }
  if (view.filters.status) params.set('status', view.filters.status);
  return finish(params, view.page);
}
