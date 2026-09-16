import { isProtectedAccount } from '@/lib/ops/drivers';
import type { DriverParams } from '@/lib/ops/driver-form';
import { runFunction } from '@/lib/parse/cloud';
import {
  MANAGER_ACCOUNT_CHANGED,
  MANAGER_IS_STAFF,
  MANAGER_NOT_FOUND,
  MANAGER_TAKEN,
} from '@/lib/parse/errors';
import { find, findOne, pointer } from '@/lib/parse/query';
import { getDriverAccount } from '@/lib/services/drivers';
import { settleQueueAfterDriverDisabled } from '@/lib/services/queue';
import type { DriverAccount } from '@/types/driver';
import type { ManagerRow } from '@/types/manager';
import type { Restaurant, RestaurantManager } from '@/types/restaurant';

const USER = '_User';
const RESTAURANT = 'Restaurant';

/**
 * Managers — the restaurant-side accounts, read with plain `_User` queries and written only
 * through the platform's cloud functions, as lib/services/drivers.ts writes drivers:
 * `addUser`, `editUser`, `toggleEnableUsers`, `sendPush`, plus `assignManager` for the
 * restaurant. A `_User` row is owner-only to a Staff session, and none of these functions
 * checks a region or an admin, so a staff account's region rule is enforced here, before
 * each call.
 */

/** A ceiling, not a page size — the list is searched, counted and paged in the browser, as
 * the Drivers list is. There is one manager per restaurant at most. */
export const MANAGER_LIST_LIMIT = 1000;

export const MANAGER_PAGE_SIZE = 25;

const MANAGER_FIELDS = ['fullname', 'username', 'phone', 'picture', 'appType', 'staffType', 'enabled', 'city', 'managerStore'];

/* ---- reads -------------------------------------------------------------------- */

/**
 * Every manager account, in one region or all: `appType` holds 'manager', which
 * `assignManager` adds and takes away. The restaurant comes included, whole — its hours and
 * switches are what the row's state chip is worked out from.
 */
export function listManagers(region: string): Promise<ManagerRow[]> {
  return find<ManagerRow>(USER, [
    { equalTo: { key: 'appType', value: 'manager' } },
    region ? { equalTo: { key: 'city', value: pointer('City', region) } } : {},
    { include: 'managerStore' },
    { select: MANAGER_FIELDS },
    { ascending: 'fullname' },
    { limit: MANAGER_LIST_LIMIT },
  ]);
}

/**
 * One manager, by id — or null when there is none. Not filtered on `appType`, unlike
 * `getDriver`: taking a manager off their restaurant also takes 'manager' out of it, and the
 * page they are on shouldn't turn into "not found" the moment ops presses Remove.
 */
export function getManager(id: string): Promise<ManagerRow | null> {
  return findOne<ManagerRow>(USER, [
    { equalTo: { key: 'objectId', value: id } },
    { include: 'managerStore' },
    { select: MANAGER_FIELDS },
  ]);
}

/** The account through `getUsers`, email included — the same read and the same narrowing
 * as a driver's. */
export function getManagerAccount(id: string): Promise<DriverAccount | null> {
  return getDriverAccount(id);
}

/** A restaurant a manager could be given, with its current manager named. */
export type AssignableRestaurant = Pick<Restaurant, 'objectId' | 'name' | 'phone' | 'address' | 'enabled' | 'picture'> & {
  manager?: RestaurantManager | null;
};

/** How many restaurants the picker lists at once — it is a search, not a browser. */
export const RESTAURANT_OPTIONS_LIMIT = 20;

/** Restaurants in a region whose name contains `query`, for the assign dialog. */
export function listAssignableRestaurants(region: string, query: string): Promise<AssignableRestaurant[]> {
  return find<AssignableRestaurant>(RESTAURANT, [
    query ? { matches: { key: 'name', value: query, modifiers: 'i' } } : {},
    region ? { equalTo: { key: 'city', value: pointer('City', region) } } : {},
    { include: 'manager' },
    { select: ['name', 'phone', 'address', 'enabled', 'picture', 'manager.fullname', 'manager.username', 'manager.phone'] },
    { ascending: 'name' },
    { limit: RESTAURANT_OPTIONS_LIMIT },
  ]);
}

/* ---- the guards every write goes through --------------------------------------- */

/**
 * The fresh account, or a refusal — the same three rules as `accountForWrite` in
 * lib/services/drivers.ts, with this screen's own sentinels: not found (or outside a staff
 * account's region, answered alike), or a staff account.
 */
async function accountForWrite(id: string, pinnedRegion: string): Promise<DriverAccount> {
  const account = await getDriverAccount(id);
  if (!account) throw new Error(MANAGER_NOT_FOUND);
  if (pinnedRegion && account.regionId !== pinnedRegion) throw new Error(MANAGER_NOT_FOUND);
  if (isProtectedAccount(account)) throw new Error(MANAGER_IS_STAFF);
  return account;
}

type LinkRow = Pick<ManagerRow, 'objectId' | 'enabled' | 'city' | 'appType' | 'staffType'> & {
  managerStore?: { objectId: string } | null;
};

async function linkRowForWrite(id: string, pinnedRegion: string): Promise<LinkRow> {
  const row = await findOne<LinkRow>(USER, [
    { equalTo: { key: 'objectId', value: id } },
    { select: ['enabled', 'city', 'appType', 'staffType', 'managerStore'] },
  ]);
  if (!row) throw new Error(MANAGER_NOT_FOUND);
  if (pinnedRegion && row.city?.objectId !== pinnedRegion) throw new Error(MANAGER_NOT_FOUND);
  if (isProtectedAccount(row)) throw new Error(MANAGER_IS_STAFF);
  return row;
}

/* ---- writes -------------------------------------------------------------------- */

/**
 * Creates a manager account through `addUser`. It has no restaurant yet — `addUser` can't
 * give it one, and the manager app shows "account not set up" until `assignManager` does —
 * so the list files it under "No restaurant", where Assign is.
 */
export async function createManager(params: DriverParams): Promise<void> {
  await runFunction('addUser', {
    fullname: params.fullname,
    username: params.username,
    password: params.password,
    email: params.email,
    phone: params.phone,
    appType: ['manager'],
    cityId: params.cityId,
    enabled: true,
  });
}

/** Saves a manager's profile through `editUser`, with the fresh row's `appType` (a manager
 * who also orders food keeps 'food') and never a password. See `updateDriver`. */
export async function updateManager(id: string, params: DriverParams, pinnedRegion: string): Promise<void> {
  const account = await accountForWrite(id, pinnedRegion);
  await runFunction('editUser', {
    id,
    fullname: params.fullname,
    email: params.email,
    phone: params.phone,
    appType: account.appType ?? ['manager'],
    cityId: pinnedRegion || params.cityId,
  });
}

/** A new password through `editUser` — which, as for a driver, signs them out everywhere. */
export async function resetManagerPassword(id: string, password: string, pinnedRegion: string): Promise<void> {
  const account = await accountForWrite(id, pinnedRegion);
  if (!account.fullname || !account.email || !account.phone || !account.regionId) {
    throw new Error('PARAMS_MISSING');
  }
  await runFunction('editUser', {
    id,
    fullname: account.fullname,
    email: account.email,
    phone: account.phone,
    appType: account.appType ?? ['manager'],
    cityId: account.regionId,
    password,
  });
}

/**
 * Activates or deactivates a manager through `toggleEnableUsers`.
 *
 * That function flips rather than sets, so the row is re-read and the call refused unless it
 * is still in the state ops saw. It also sets the manager's restaurant's `enabled` to the
 * account's new value and does the same to every dish (`Food`) of that restaurant — not its
 * menus — so this is also switching the restaurant off the platform, or back on with every
 * dish on. The dialogs say so before anyone presses it.
 *
 * An account that is also a driver has its queue emptied, as `setDriverEnabled` does.
 */
export async function setManagerEnabled(id: string, enabled: boolean, pinnedRegion: string): Promise<void> {
  const row = await linkRowForWrite(id, pinnedRegion);
  if ((row.enabled === true) === enabled) throw new Error(MANAGER_ACCOUNT_CHANGED);

  await runFunction('toggleEnableUsers', { ids: [id] });

  if (!enabled && row.appType?.includes('driver')) {
    await settleQueueAfterDriverDisabled(id).catch((error: unknown) => {
      if (process.env.NODE_ENV !== 'production') console.error('[queue] after deactivate', error);
    });
  }
}

/**
 * Gives a manager a restaurant through `assignManager`.
 *
 * Refused when the account already has one (`MANAGER_TAKEN`, as on the restaurant's own
 * dialog), and when a staff account picks a restaurant outside its region. Whoever manages
 * the restaurant now loses it — and the manager app with it — which the dialog shows first.
 */
export async function assignManagerRestaurant(managerId: string, restaurantId: string, pinnedRegion: string): Promise<void> {
  const row = await linkRowForWrite(managerId, pinnedRegion);
  if (row.managerStore?.objectId) throw new Error(MANAGER_TAKEN);

  const restaurant = await findOne<Pick<Restaurant, 'objectId'> & { city?: { objectId: string } }>(RESTAURANT, [
    { equalTo: { key: 'objectId', value: restaurantId } },
    { select: ['city'] },
  ]);
  if (!restaurant) throw new Error(MANAGER_ACCOUNT_CHANGED);
  if (pinnedRegion && restaurant.city?.objectId !== pinnedRegion) throw new Error(MANAGER_NOT_FOUND);

  await runFunction('assignManager', { storeId: restaurantId, managerId });
}

/**
 * Takes a manager off their restaurant through `assignManager` with no `managerId`, which
 * clears both pointers and removes 'manager' from the account's `appType` — so the account
 * leaves the Managers list, and is left a plain account that can be assigned again.
 *
 * Refused unless the restaurant still names this account: that function unlinks whoever the
 * *restaurant* names, so on a restaurant that has moved on to someone else it would take the
 * other manager off and leave this one as they are.
 */
export async function removeManagerFromRestaurant(managerId: string, pinnedRegion: string): Promise<void> {
  const row = await linkRowForWrite(managerId, pinnedRegion);
  const storeId = row.managerStore?.objectId;
  if (!storeId) throw new Error(MANAGER_ACCOUNT_CHANGED);

  const restaurant = await findOne<Pick<Restaurant, 'objectId'> & { manager?: { objectId: string } | null }>(RESTAURANT, [
    { equalTo: { key: 'objectId', value: storeId } },
    { select: ['manager'] },
  ]);
  if (restaurant?.manager?.objectId !== managerId) throw new Error(MANAGER_ACCOUNT_CHANGED);

  await runFunction('assignManager', { storeId });
}

/**
 * A push to the manager app, in ops' own words. With no `newOrder`, `cancel` or `button` in
 * `data`, the app's `showMessage` shows the title and text as a popup and does nothing else
 * (switch-manager src/screens/Home/Home.js). Every value a string, for FCM.
 */
export async function messageManager(id: string, title: string, body: string): Promise<void> {
  await runFunction('sendPush', {
    title,
    body,
    userId: id,
    appType: 'manager',
    data: { title, body, icon: 'info' },
  });
}
