import type { DateRange } from '@/lib/ops/date-range';
import { isProtectedAccount } from '@/lib/ops/drivers';
import type { DriverParams } from '@/lib/ops/driver-form';
import { runFunction } from '@/lib/parse/cloud';
import { DRIVER_IS_STAFF, DRIVER_NOT_FOUND, DRIVER_STATE_CHANGED } from '@/lib/parse/errors';
import { find, findOne, findWithCount, pointer, type PageResult, type QueryParam } from '@/lib/parse/query';
import { settleQueueAfterDriverDisabled } from '@/lib/services/queue';
import type { DriverAccount, DriverRow } from '@/types/driver';
import type { OrderRow } from '@/types/order';

const USER = '_User';
const ORDER = 'Order';

/**
 * Drivers — read with plain `_User` queries, written only through the platform's cloud
 * functions, the way switch-dashboard's Users page writes them (src/pages/Users/Users.jsx):
 * `addUser`, `editUser`, `toggleEnableUsers`, plus `sendPush` for a message.
 *
 * Nothing else is possible from a Staff session: a `_User` row's default ACL is its owner
 * only, so a plain save would be refused. And nothing on the server scopes any of these to a
 * region or to admins — every function accepts any role member — so the region rule a staff
 * account works under is enforced here, before each call, and nowhere else.
 */

/**
 * A ceiling, not a page size. The whole fleet in scope is read at once so the search, the
 * status counts and the order can be worked out in the browser, as the live map does with
 * its drivers. A region with more than a thousand driver accounts is several times the
 * platform's size; past it, the screen says the list is cut short.
 */
export const DRIVER_LIST_LIMIT = 1000;

/** Rows per page of the list, paged in the browser. */
export const DRIVER_PAGE_SIZE = 25;

/**
 * The columns the screens show. Narrowed because this is `_User`: no push tokens, carts or
 * auth data for a thousand accounts. `createdAt`/`updatedAt` come back regardless.
 */
const DRIVER_FIELDS = [
  'fullname',
  'username',
  'phone',
  'picture',
  'appType',
  'staffType',
  'enabled',
  'city',
  'driverActive',
  'driverLocation',
  'driverRating',
  'driverParams',
  'driverOrdersAccepted',
];

/* ---- reads -------------------------------------------------------------------- */

/**
 * Every driver account, in one region or all.
 *
 * "A driver" is an account whose `appType` holds 'driver' — an equality against an array
 * column matches rows whose array contains the value. Unlike the map's online query, this
 * one does filter on the tag: the fleet is the accounts provisioned for the driver app,
 * whether or not they ever went online.
 *
 * Sorted by name on the server too, so that a list cut short at the ceiling is always the
 * same thousand.
 */
export function listDrivers(region: string): Promise<DriverRow[]> {
  return find<DriverRow>(USER, [
    { equalTo: { key: 'appType', value: 'driver' } },
    region ? { equalTo: { key: 'city', value: pointer('City', region) } } : {},
    { select: DRIVER_FIELDS },
    { ascending: 'fullname' },
    { limit: DRIVER_LIST_LIMIT },
  ]);
}

/** One driver, by id — or null when there is none, including an account that isn't a
 * driver: the detail page is for drivers, and a pasted customer id should not open one. */
export function getDriver(id: string): Promise<DriverRow | null> {
  return findOne<DriverRow>(USER, [
    { equalTo: { key: 'objectId', value: id } },
    { equalTo: { key: 'appType', value: 'driver' } },
    { select: DRIVER_FIELDS },
  ]);
}

type GetUsersResult = { count?: number; results?: Record<string, unknown>[] };

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * The driver's account, read fresh through `getUsers` — the only read that returns
 * `email`, which Parse hides from a session read (protectedFields) and which `editUser`
 * requires.
 *
 * `getUsers` matches its search with `startsWith`, so the result is checked for the exact
 * id rather than trusted. It returns the whole `_User` row, push tokens and auth data
 * included, so it is narrowed here, straight away, to the fields the forms need; nothing
 * else reaches the cache.
 */
export async function getDriverAccount(id: string): Promise<DriverAccount | null> {
  const response = await runFunction<Record<string, unknown>, GetUsersResult>('getUsers', {
    limit: 1,
    skip: 0,
    search: { key: 'objectId', value: id },
  });
  const row = (response?.results ?? []).find((item) => item.objectId === id);
  if (!row) return null;

  const city = row.city as { objectId?: unknown } | undefined;
  return {
    objectId: id,
    fullname: stringOf(row.fullname),
    username: stringOf(row.username),
    email: stringOf(row.email),
    phone: stringOf(row.phone),
    appType: Array.isArray(row.appType) ? row.appType.filter((type): type is string => typeof type === 'string') : undefined,
    staffType: stringOf(row.staffType),
    enabled: typeof row.enabled === 'boolean' ? row.enabled : undefined,
    regionId: stringOf(city?.objectId) ?? '',
  };
}

/** An order the deliveries panel lists: the board's row, with the restaurant (its name)
 * and the city (its currency) included. */
export type DriverDelivery = OrderRow;

/**
 * A ceiling for one period's orders. The panel adds up money in the browser, so every
 * order in the period has to be read; five hundred in thirty days is more than the busiest
 * driver does. Past it, the panel says the totals are incomplete and links to the board.
 */
export const DELIVERIES_LIMIT = 500;

/**
 * Every order carrying this driver in a period, newest first.
 *
 * `region` is the staff account's pinned region, when there is one — the same confinement
 * the orders board applies. An admin passes '' and sees them all.
 */
export function listDriverDeliveries(
  driverId: string,
  range: Pick<DateRange, 'start' | 'end'>,
  region: string,
): Promise<PageResult<DriverDelivery>> {
  const params: QueryParam[] = [
    { equalTo: { key: 'driver', value: pointer(USER, driverId) } },
    range.start ? { greaterThanOrEqualTo: { key: 'createdAt', value: range.start } } : {},
    range.end ? { lessThanOrEqualTo: { key: 'createdAt', value: range.end } } : {},
    region ? { equalTo: { key: 'city', value: pointer('City', region) } } : {},
    { include: 'restaurant' },
    { include: 'city' },
    { descending: 'createdAt' },
    { limit: DELIVERIES_LIMIT },
  ];
  return findWithCount<DriverDelivery>(ORDER, params);
}

/* ---- the guards every write goes through --------------------------------------- */

/**
 * The fresh account, or a refusal — the same three rules before every write:
 *
 * - `DRIVER_NOT_FOUND` for an account that doesn't exist *or* sits outside a staff
 *   account's region. The two are answered alike, as `CatalogueGate` does for a restaurant:
 *   the list never offers an out-of-region driver, so the only way to one is a pasted link,
 *   and "not in your region" would confirm the account exists.
 * - `DRIVER_IS_STAFF` for a staff or admin account — see `isProtectedAccount`.
 */
async function accountForWrite(id: string, pinnedRegion: string): Promise<DriverAccount> {
  const account = await getDriverAccount(id);
  if (!account) throw new Error(DRIVER_NOT_FOUND);
  if (pinnedRegion && account.regionId !== pinnedRegion) throw new Error(DRIVER_NOT_FOUND);
  if (isProtectedAccount(account)) throw new Error(DRIVER_IS_STAFF);
  return account;
}

/* ---- writes -------------------------------------------------------------------- */

/**
 * Creates a driver account through `addUser`, which also writes every default the driver
 * app expects to find on the row (`driverActive: false`, `driverParams`, an empty cart…).
 * Enabled from the start: an account ops just made is one they mean to use.
 */
export async function createDriver(params: DriverParams): Promise<void> {
  await runFunction('addUser', {
    fullname: params.fullname,
    username: params.username,
    password: params.password,
    email: params.email,
    phone: params.phone,
    appType: ['driver'],
    cityId: params.cityId,
    enabled: true,
  });
}

/**
 * Saves a driver's profile through `editUser`.
 *
 * Three things the function does that the form can't see, each handled here:
 *
 * - it writes `appType` as given, so the value comes from the fresh row rather than this
 *   form — a driver who is also a customer keeps 'food';
 * - it writes `staffType` whether or not it is sent, so a staff account is refused before
 *   the call rather than stripped of its role by it;
 * - it has no idea about regions, so a staff account's own is sent whatever the draft says.
 *
 * No `password` is sent: that would sign the driver out everywhere. Resetting it is its own
 * action.
 */
export async function updateDriver(id: string, params: DriverParams, pinnedRegion: string): Promise<void> {
  const account = await accountForWrite(id, pinnedRegion);
  await runFunction('editUser', {
    id,
    fullname: params.fullname,
    email: params.email,
    phone: params.phone,
    appType: account.appType ?? ['driver'],
    cityId: pinnedRegion || params.cityId,
  });
}

/**
 * Gives a driver a new password through `editUser`, with every other column sent back as
 * it is on the fresh row — the function requires them all.
 *
 * Setting a password is also, on this backend, the only way to sign a driver out: Parse
 * revokes every session of a user whose password changes (`revokeSessionOnPasswordReset`),
 * so the driver app is sent back to its login screen on its next request.
 *
 * Refused for a row that is missing a column `editUser` insists on, rather than inventing
 * one: a driver with no phone or email on file needs their profile fixed first.
 */
export async function resetDriverPassword(id: string, password: string, pinnedRegion: string): Promise<void> {
  const account = await accountForWrite(id, pinnedRegion);
  if (!account.fullname || !account.email || !account.phone || !account.regionId) {
    throw new Error('PARAMS_MISSING');
  }
  await runFunction('editUser', {
    id,
    fullname: account.fullname,
    email: account.email,
    phone: account.phone,
    appType: account.appType ?? ['driver'],
    cityId: account.regionId,
    password,
  });
}

/**
 * Activates or deactivates a driver through `toggleEnableUsers`.
 *
 * That function *flips* whatever it finds rather than setting a value, so the row is
 * re-read first and the call refused unless it is still in the state ops saw — two
 * consoles pressing "Deactivate" together must not end with the driver active again. Same
 * as `setRestaurantEnabled`.
 *
 * Deactivating also switches the driver's GO off, but does not sign them out: their app
 * carries on until it restarts. Afterwards, every order still lined up behind them goes back
 * to needing a driver. That second step failing doesn't un-deactivate anyone, so it is
 * logged, not thrown — the runner's own look then refuses to send to them.
 */
export async function setDriverEnabled(id: string, enabled: boolean, pinnedRegion: string): Promise<void> {
  const row = await findOne<Pick<DriverRow, 'objectId' | 'enabled' | 'city' | 'appType' | 'staffType'>>(USER, [
    { equalTo: { key: 'objectId', value: id } },
    { select: ['enabled', 'city', 'appType', 'staffType'] },
  ]);
  if (!row) throw new Error(DRIVER_NOT_FOUND);
  if (pinnedRegion && row.city?.objectId !== pinnedRegion) throw new Error(DRIVER_NOT_FOUND);
  if (isProtectedAccount(row)) throw new Error(DRIVER_IS_STAFF);
  if ((row.enabled === true) === enabled) throw new Error(DRIVER_STATE_CHANGED);

  await runFunction('toggleEnableUsers', { ids: [id] });

  if (!enabled) {
    await settleQueueAfterDriverDisabled(id).catch((error: unknown) => {
      if (process.env.NODE_ENV !== 'production') console.error('[queue] after deactivate', error);
    });
  }
}

/**
 * Sends a driver a push with ops' own words.
 *
 * Only `title` and `body` in the payload: without `newOrder` or `cancel` the driver app's
 * `showMessage` shows the text as a card and does nothing else
 * (switch-driver/src/screens/Home/Home.js). Every `data` value is a string, because the
 * platform hands `data` straight to FCM, which takes no other type.
 *
 * **No `icon` — a name the app doesn't know crashes it.** Each app turns `data.icon` into a
 * picture from a fixed list (`MESSAGE_ICON_TYPES` in its src/ui/Message/Message.js) and,
 * until the fix of 2026-09-17, rendered any other name as a native view by that name, which
 * takes the app down as the push arrives. `info` is only on the list from that fix on, and
 * the builds on phones predate it, so every message this function, `messageManager` and
 * support replies sent with `icon: 'info'` crashed the app it reached. switch-dashboard never
 * sends an icon, which is why its pushes never did. Put `info` back once the fixed builds are
 * what drivers, managers and customers run.
 *
 * `sendPush` refuses a driver whose app never registered for notifications; that refusal is
 * passed on, because unlike the queue's heads-up, a message that didn't go is exactly what
 * the person sending it needs to know.
 */
export async function messageDriver(id: string, title: string, body: string): Promise<void> {
  await runFunction('sendPush', {
    title,
    body,
    userId: id,
    appType: 'driver',
    data: { title, body },
  });
}
