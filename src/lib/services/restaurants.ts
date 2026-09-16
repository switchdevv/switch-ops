import type { PreparedImage } from '@/lib/media/image';
import { runFunction } from '@/lib/parse/cloud';
import { MANAGER_TAKEN, RESTAURANT_STATE_CHANGED } from '@/lib/parse/errors';
import { deleteStoredFile, uploadImage } from '@/lib/parse/files';
import { createObject, updateObject } from '@/lib/parse/objects';
import { find, findOne, findWithCount, pointer, type PageResult, type QueryParam } from '@/lib/parse/query';
import type { RestaurantFields } from '@/lib/ops/restaurant-form';
import { deleteProductsWhere } from '@/lib/services/products';
import type { RestaurantFilters, RestaurantStatus } from '@/lib/url/restaurant-filters';
import type { Category, ManagerCandidate, Restaurant, RestaurantRow } from '@/types/restaurant';

const RESTAURANT = 'Restaurant';

export const RESTAURANT_PAGE_SIZE = 25;

/**
 * Restaurants — read with plain queries, written the way switch-dashboard's Stores page
 * writes them (src/pages/Stores/Stores.jsx): a plain save for the restaurant's own columns
 * and for Pause, and the platform's cloud functions for everything that reaches further
 * than the row — switching it on or off, its manager, its region, deleting it.
 */

const INCLUDES: QueryParam[] = [{ include: 'city' }, { include: 'manager' }, { include: 'categories' }];

function statusParams(status: RestaurantStatus | ''): QueryParam[] {
  switch (status) {
    case 'live':
      return [{ equalTo: { key: 'enabled', value: true } }, { equalTo: { key: 'active', value: true } }];
    // "Not on" rather than "off", as the customer app reads both switches: a row that never
    // had the field written is paused (or disabled) to a customer too.
    case 'paused':
      return [{ equalTo: { key: 'enabled', value: true } }, { notEqualTo: { key: 'active', value: true } }];
    case 'disabled':
      return [{ notEqualTo: { key: 'enabled', value: true } }];
    default:
      return [];
  }
}

function listParams(filters: RestaurantFilters): QueryParam[] {
  const { query, field, region, category, status, featuredOnly } = filters;
  return [
    // A name or a phone matches anywhere in it, ignoring case — "pizza" finds "Oran Pizza".
    // The regex is escaped in lib/parse/query.ts.
    query && field === 'name' ? { matches: { key: 'name', value: query, modifiers: 'i' } } : {},
    query && field === 'phone' ? { matches: { key: 'phone', value: query } } : {},
    query && field === 'objectId' ? { startsWith: { key: 'objectId', value: query } } : {},
    query && field === 'manager' ? { equalTo: { key: 'manager', value: pointer('_User', query) } } : {},
    region ? { equalTo: { key: 'city', value: pointer('City', region) } } : {},
    // An equality against an array column matches rows whose array contains it.
    category ? { equalTo: { key: 'categories', value: pointer('Category', category) } } : {},
    ...statusParams(status),
    featuredOnly ? { equalTo: { key: 'isFeatured', value: true } } : {},
  ];
}

export function listRestaurants(filters: RestaurantFilters, page: number): Promise<PageResult<RestaurantRow>> {
  return findWithCount<RestaurantRow>(RESTAURANT, [
    ...listParams(filters),
    ...INCLUDES,
    filters.sort === 'newest' ? { descending: 'createdAt' } : { ascending: 'name' },
    // A tiebreak, so two restaurants with the same name can't swap pages between requests.
    { addAscending: 'objectId' },
    { limit: RESTAURANT_PAGE_SIZE },
    { skip: (page - 1) * RESTAURANT_PAGE_SIZE },
  ]);
}

export function getRestaurant(id: string): Promise<RestaurantRow | null> {
  return findOne<RestaurantRow>(RESTAURANT, [{ equalTo: { key: 'objectId', value: id } }, ...INCLUDES]);
}

/** Every category, for the filter and the form. A few dozen at most; created by admins on
 * the dashboard. */
export function listCategories(): Promise<Category[]> {
  return find<Category>('Category', [{ ascending: 'name' }, { limit: 1000 }]);
}

/* ---- saving -------------------------------------------------------------------- */

export type CreateRestaurantInput = { fields: RestaurantFields; picture: PreparedImage | null };

/**
 * Creates a restaurant and returns its id. Readable by everyone and writable by the Staff
 * role, the ACL the dashboard gives one (`post` with `isPublic` and `isRole`) — until a
 * manager is assigned, when `assignManager` rewrites it.
 */
export async function createRestaurant({ fields, picture }: CreateRestaurantInput): Promise<string> {
  const file = picture ? await uploadImage(picture.fileName, picture.dataUrl) : null;
  return createObject(RESTAURANT, file ? { ...fields, picture: file } : fields, {
    publicRead: true,
    role: 'Staff',
  });
}

export type UpdateRestaurantInput = {
  id: string;
  /** Only the changed columns — see `changedRestaurantFields`. */
  fields: RestaurantFields;
  picture: PreparedImage | null;
  previous: Pick<Restaurant, 'picture'> & { regionId: string };
};

/**
 * Saves an edit, then does the two follow-ups the dashboard does after one:
 *
 * - a new region goes through `changeRegion` too, which copies it onto every dish — each
 *   dish carries its own `city`, and the customer app finds dishes by it.
 * - a new picture is handed to the restaurant's manager with `assignStoreFile`, so the
 *   manager app may replace it later; then the picture it replaced is deleted.
 *
 * Neither follow-up failing un-saves the edit, so neither is reported as a failed save.
 */
export async function updateRestaurant({ id, fields, picture, previous }: UpdateRestaurantInput): Promise<void> {
  const file = picture ? await uploadImage(picture.fileName, picture.dataUrl) : null;
  const body = file ? { ...fields, picture: file } : fields;
  if (Object.keys(body).length > 0) await updateObject(RESTAURANT, id, body);

  const city = fields.city as { objectId?: string } | undefined;
  if (city?.objectId && city.objectId !== previous.regionId) {
    await runFunction('changeRegion', { cityId: city.objectId, storeId: id });
  }

  if (file) {
    await runFunction('assignStoreFile', { filename: file.name, storeId: id }).catch(logFollowUp);
    if (previous.picture?.name) await deleteStoredFile(previous.picture.name).catch(logFollowUp);
  }
}

function logFollowUp(error: unknown) {
  if (process.env.NODE_ENV !== 'production') console.error('[restaurants] follow-up', error);
}

/** Pause and resume — the dashboard's and the manager app's own switch, a plain save. */
export async function setRestaurantActive(id: string, active: boolean): Promise<void> {
  await updateObject(RESTAURANT, id, { active });
}

/**
 * Takes a restaurant off the platform, or puts it back, through `toggleEnableStores` — which
 * also switches its menus, its dishes and its manager's account the same way.
 *
 * The function *flips* whatever it finds rather than setting a value, so the row is re-read
 * first and the call refused unless it is still in the state ops saw: two consoles pressing
 * "Disable" together must not end with it enabled.
 */
export async function setRestaurantEnabled(id: string, enabled: boolean): Promise<void> {
  const row = await findOne<Pick<Restaurant, 'objectId' | 'enabled'>>(RESTAURANT, [
    { equalTo: { key: 'objectId', value: id } },
    { select: ['enabled'] },
  ]);
  if (!row || (row.enabled === true) === enabled) throw new Error(RESTAURANT_STATE_CHANGED);
  await runFunction('toggleEnableStores', { ids: [id] });
}

/**
 * Deletes a restaurant through `deleteStores`: with it go its manager's account (and that
 * account's sessions and addresses), its menus, promos and reviews, and their pictures.
 * Admin-only in this console.
 *
 * The function leaves the restaurant's dishes behind, so they are deleted after it. After,
 * not before: if that second step fails the restaurant is still gone — which is what was
 * asked — and the leftovers are what the dashboard has always left.
 */
export async function deleteRestaurant(id: string): Promise<void> {
  await runFunction('deleteStores', { ids: [id] });
  await deleteProductsWhere({ equalTo: { key: 'restaurant', value: pointer(RESTAURANT, id) } }).catch(logFollowUp);
}

/* ---- the manager --------------------------------------------------------------- */

/** An account by id, for the manager dialog to show before it assigns anyone. */
export function getManagerCandidate(userId: string): Promise<ManagerCandidate | null> {
  return findOne<ManagerCandidate>('_User', [
    { equalTo: { key: 'objectId', value: userId } },
    { select: ['fullname', 'username', 'phone', 'appType', 'enabled', 'staffType', 'managerStore'] },
  ]);
}

/** The name of the restaurant an account already manages. */
export async function getRestaurantName(id: string): Promise<string | null> {
  const row = await findOne<Pick<Restaurant, 'objectId' | 'name'>>(RESTAURANT, [
    { equalTo: { key: 'objectId', value: id } },
    { select: ['name'] },
  ]);
  return row ? (row.name ?? null) : null;
}

/**
 * Makes an account the restaurant's manager, or removes the manager when `managerId` is
 * null, through `assignManager` — which also gives the account the manager app, hands it
 * write access to the restaurant, its menus, dishes and promos, and takes the app back
 * from the manager it replaces.
 *
 * Refused when the account already runs another restaurant: `managerStore` is one pointer,
 * and the function would move it without clearing that restaurant's `manager`, leaving two
 * restaurants naming one account.
 */
export async function assignRestaurantManager(restaurantId: string, managerId: string | null): Promise<void> {
  if (managerId) {
    const candidate = await getManagerCandidate(managerId);
    const current = candidate?.managerStore?.objectId;
    if (current && current !== restaurantId) throw new Error(MANAGER_TAKEN);
  }
  await runFunction('assignManager', managerId ? { storeId: restaurantId, managerId } : { storeId: restaurantId });
}
