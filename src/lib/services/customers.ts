import type { StaffRole } from '@/lib/auth/access';
import type { CustomerParams } from '@/lib/ops/customer-form';
import { deleteBlockOf, manageBlockOf, phoneSearchDigits, signInProvidersOf, STAFF_TYPE_SPELLINGS } from '@/lib/ops/customers';
import { runFunction } from '@/lib/parse/cloud';
import {
  CUSTOMER_IS_MANAGER,
  CUSTOMER_IS_SELF,
  CUSTOMER_NOT_FOUND,
  CUSTOMER_STATE_CHANGED,
} from '@/lib/parse/errors';
import { count, find, findOne, findWithCount, pointer, type PageResult, type QueryParam } from '@/lib/parse/query';
import type { CustomerFilters } from '@/lib/url/customer-filters';
import type { CustomerAccount, CustomerAddress, CustomerOrderStats, CustomerRow } from '@/types/customer';
import type { OrderRow } from '@/types/order';

const USER = '_User';
const ORDER = 'Order';

export const CUSTOMER_PAGE_SIZE = 25;
export const CUSTOMER_ORDERS_PAGE_SIZE = 10;

/**
 * Customers — read with plain `_User` queries where Parse allows it, and through `getUsers`
 * (master key) for what it hides; written only through the platform's cloud functions, the
 * way switch-dashboard's Users page writes them: `addUser`, `editUser`, `toggleEnableUsers`,
 * `deleteUsers`.
 *
 * A plain save is impossible anyway — a `_User` row's ACL is its owner. And nothing on the
 * server scopes any of these functions to a region or to admins: every one accepts any Staff
 * role member, for any account. So the rules a staff account works under (its region, no
 * staff accounts, no deleting) are enforced here, before each call, and nowhere else.
 */

/** The columns the list shows. `createdAt` comes back regardless. */
const LIST_FIELDS = ['fullname', 'username', 'phone', 'picture', 'appType', 'staffType', 'enabled', 'city', 'managerStore'];

/** Who may be listed: food accounts, and for a staff account, never a staff one. */
function scopeParams(region: string, hideStaff: boolean): QueryParam[] {
  return [
    // An equality against an array column matches rows whose array contains the value.
    { equalTo: { key: 'appType', value: 'food' } },
    region ? { equalTo: { key: 'city', value: pointer('City', region) } } : {},
    // `notContainedIn` also matches a row with no `staffType` at all, which is every customer.
    hideStaff ? { notContainedIn: { key: 'staffType', value: STAFF_TYPE_SPELLINGS } } : {},
  ];
}

function searchParams(filters: CustomerFilters): QueryParam[] {
  const { query, field } = filters;
  if (!query) return [];
  switch (field) {
    // Anywhere in the name, ignoring case — "benali" finds "Karim Benali". The regex is
    // escaped in lib/parse/query.ts. Unindexed, so a scan; fine at ops' request rate.
    case 'name':
      return [{ matches: { key: 'fullname', value: query, modifiers: 'i' } }];
    case 'phone': {
      const digits = phoneSearchDigits(query);
      return [digits ? { matches: { key: 'phone', value: digits } } : { matches: { key: 'phone', value: query } }];
    }
    case 'username':
      return [{ startsWith: { key: 'username', value: query } }];
    case 'objectId':
      return [{ startsWith: { key: 'objectId', value: query } }];
    default:
      return [];
  }
}

function statusParams(filters: CustomerFilters): QueryParam[] {
  if (filters.status === 'enabled') return [{ equalTo: { key: 'enabled', value: true } }];
  // "Not on", as `beforeLogin` reads it: an unwritten field can't sign in either.
  if (filters.status === 'disabled') return [{ notEqualTo: { key: 'enabled', value: true } }];
  return [];
}

export function listCustomers(filters: CustomerFilters, page: number, hideStaff: boolean): Promise<PageResult<CustomerRow>> {
  if (filters.query && filters.field === 'email') return searchCustomersByEmail(filters, page, hideStaff);

  return findWithCount<CustomerRow>(USER, [
    ...scopeParams(filters.region, hideStaff),
    ...searchParams(filters),
    ...statusParams(filters),
    { select: LIST_FIELDS },
    filters.sort === 'name' ? { ascending: 'fullname' } : { descending: 'createdAt' },
    // A tiebreak, so two rows with the same name or second can't swap pages between reads.
    { addAscending: 'objectId' },
    { limit: CUSTOMER_PAGE_SIZE },
    { skip: (page - 1) * CUSTOMER_PAGE_SIZE },
  ]);
}

/* ---- getUsers ------------------------------------------------------------------ */

type RawUser = Record<string, unknown>;
type GetUsersResult = { count?: number; results?: RawUser[] };

function stringOf(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function stringsOf(value: unknown): string[] | undefined {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : undefined;
}

function lengthOf(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function objectIdOf(value: unknown): string | undefined {
  return value && typeof value === 'object' ? stringOf((value as { objectId?: unknown }).objectId) : undefined;
}

/** A raw `getUsers` row, cut down to a list row. Nothing else of it is kept. */
function toCustomerRow(raw: RawUser): CustomerRow {
  const cityId = objectIdOf(raw.city);
  const storeId = objectIdOf(raw.managerStore);
  const picture = raw.picture as { url?: unknown; name?: unknown } | undefined;
  return {
    objectId: stringOf(raw.objectId) ?? '',
    createdAt: stringOf(raw.createdAt) ?? '',
    updatedAt: stringOf(raw.updatedAt) ?? '',
    fullname: stringOf(raw.fullname),
    username: stringOf(raw.username),
    phone: stringOf(raw.phone),
    picture:
      picture && typeof picture.url === 'string'
        ? { __type: 'File', url: picture.url, name: stringOf(picture.name) ?? '' }
        : undefined,
    appType: stringsOf(raw.appType),
    staffType: stringOf(raw.staffType),
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : undefined,
    city: cityId ? pointer('City', cityId) : undefined,
    managerStore: storeId ? pointer('Restaurant', storeId) : undefined,
  };
}

/**
 * The email search, through `getUsers` — the only read that may look at the column.
 *
 * It matches from the start of the address and can't say "not a staff account" or "enabled",
 * so those two are applied to the page it returns. The count is the server's and can run a
 * little ahead of the rows on a page, which for a lookup by email — nearly always one row —
 * is a price worth paying over not being able to search by email at all.
 */
async function searchCustomersByEmail(filters: CustomerFilters, page: number, hideStaff: boolean): Promise<PageResult<CustomerRow>> {
  const response = await runFunction<Record<string, unknown>, GetUsersResult>('getUsers', {
    limit: CUSTOMER_PAGE_SIZE,
    skip: (page - 1) * CUSTOMER_PAGE_SIZE,
    appType: 'food',
    // Lower-cased: Parse stores emails as typed, but every app lower-cases on signup.
    search: { key: 'email', value: filters.query.toLowerCase() },
    ...(filters.region ? { cityId: filters.region } : {}),
    ...(filters.status === 'disabled' ? { disabled: true } : {}),
  });

  const rows = (response?.results ?? [])
    .map(toCustomerRow)
    .filter((row) => !hideStaff || manageBlockOf(row, 'staff', undefined) !== 'staff')
    .filter((row) => filters.status !== 'enabled' || row.enabled === true);

  return { results: rows, count: Math.max(response?.count ?? 0, rows.length) };
}

/**
 * The customer's account, read fresh through `getUsers`.
 *
 * `getUsers` matches its search with `startsWith`, so the result is checked for the exact id
 * rather than trusted. It returns the whole row — OAuth tokens and all — so it is narrowed
 * here, straight away; nothing else reaches the cache.
 */
export async function getCustomerAccount(id: string): Promise<CustomerAccount | null> {
  const response = await runFunction<Record<string, unknown>, GetUsersResult>('getUsers', {
    limit: 1,
    skip: 0,
    search: { key: 'objectId', value: id },
  });
  const raw = (response?.results ?? []).find((item) => item.objectId === id);
  if (!raw || !stringsOf(raw.appType)?.includes('food')) return null;

  const address = raw.address as RawUser | undefined;
  const store = raw.managerStore as RawUser | undefined;
  const picture = raw.picture as { url?: unknown } | undefined;

  return {
    objectId: id,
    createdAt: stringOf(raw.createdAt),
    updatedAt: stringOf(raw.updatedAt),
    fullname: stringOf(raw.fullname),
    username: stringOf(raw.username),
    email: stringOf(raw.email),
    phone: stringOf(raw.phone),
    pictureUrl: stringOf(picture?.url),
    appType: stringsOf(raw.appType),
    staffType: stringOf(raw.staffType),
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : undefined,
    regionId: objectIdOf(raw.city) ?? '',
    cartCount: lengthOf(raw.cartFood),
    promosUsedCount: lengthOf(raw.promosUsed),
    favoritesCount: lengthOf(raw.favorites),
    signInProviders: signInProvidersOf(raw.authData),
    address:
      address && stringOf(address.objectId)
        ? {
            objectId: stringOf(address.objectId) ?? '',
            createdAt: stringOf(address.createdAt) ?? '',
            updatedAt: stringOf(address.updatedAt) ?? '',
            name: stringOf(address.name),
            address: stringOf(address.address),
            location: address.location as CustomerAddress['location'],
          }
        : null,
    managerStore: store && stringOf(store.objectId) ? { objectId: stringOf(store.objectId) ?? '', name: stringOf(store.name) } : null,
  };
}

/* ---- the customer's page ------------------------------------------------------- */

/** Every address the customer has saved, newest first. A handful at most. */
export function listCustomerAddresses(id: string): Promise<CustomerAddress[]> {
  return find<CustomerAddress>('Address', [
    { equalTo: { key: 'user', value: pointer(USER, id) } },
    { select: ['name', 'address', 'location'] },
    { descending: 'createdAt' },
    { limit: 50 },
  ]);
}

/** What the board includes on an order (lib/services/orders.ts), so the rows here expand
 * into the same detail, with the same actions. */
const ORDER_INCLUDES: QueryParam[] = [
  { include: 'user' },
  { include: 'driver' },
  { include: 'restaurant' },
  { include: 'city' },
  { include: 'food' },
  { include: 'promo' },
];

function customerOrderScope(id: string, region: string): QueryParam[] {
  return [
    { equalTo: { key: 'user', value: pointer(USER, id) } },
    // A staff account sees only its region's orders here, as on the board.
    region ? { equalTo: { key: 'city', value: pointer('City', region) } } : {},
  ];
}

export function listCustomerOrders(id: string, page: number, region: string): Promise<PageResult<OrderRow>> {
  return findWithCount<OrderRow>(ORDER, [
    ...customerOrderScope(id, region),
    ...ORDER_INCLUDES,
    { descending: 'createdAt' },
    { limit: CUSTOMER_ORDERS_PAGE_SIZE },
    { skip: (page - 1) * CUSTOMER_ORDERS_PAGE_SIZE },
  ]);
}

/**
 * Three counts, three requests — the order class has no aggregation this console may run.
 * "Delivered" is status 3 and not canceled: a canceled order keeps whatever status it had
 * reached (lib/ops/order-status.ts).
 */
export async function getCustomerOrderStats(id: string, region: string): Promise<CustomerOrderStats> {
  const scope = customerOrderScope(id, region);
  const [total, delivered, canceled] = await Promise.all([
    count(ORDER, scope),
    count(ORDER, [...scope, { equalTo: { key: 'status', value: 3 } }, { equalTo: { key: 'canceled', value: false } }]),
    count(ORDER, [...scope, { equalTo: { key: 'canceled', value: true } }]),
  ]);
  return { total, delivered, canceled };
}

/* ---- the guard every write goes through ----------------------------------------- */

export type Actor = {
  role: StaffRole;
  /** The signed-in account. */
  selfId: string | undefined;
  /** A staff account's region, or '' for an admin. */
  pinnedRegion: string;
};

/**
 * The fresh account, or a refusal:
 *
 * - `CUSTOMER_NOT_FOUND` for an account that doesn't exist, isn't a customer, sits outside a
 *   staff account's region, or is a staff account a staff member may not see — answered
 *   alike, because the list never offers those, and "not in your region" would confirm the
 *   account exists.
 * - `CUSTOMER_IS_SELF` for the signed-in account.
 */
async function accountForWrite(id: string, actor: Actor): Promise<CustomerAccount> {
  const account = await getCustomerAccount(id);
  if (!account) throw new Error(CUSTOMER_NOT_FOUND);
  if (actor.pinnedRegion && account.regionId !== actor.pinnedRegion) throw new Error(CUSTOMER_NOT_FOUND);
  const block = manageBlockOf({ ...account }, actor.role, actor.selfId);
  if (block === 'staff') throw new Error(CUSTOMER_NOT_FOUND);
  if (block === 'self') throw new Error(CUSTOMER_IS_SELF);
  return account;
}

/* ---- writes -------------------------------------------------------------------- */

/**
 * Creates a customer account through `addUser`, which also writes every default the customer
 * app expects on the row (an empty cart, favorites, promos, cash payment). Enabled from the
 * start, and in the staff account's own region whatever the form says.
 */
export async function createCustomer(params: CustomerParams, actor: Actor): Promise<void> {
  await runFunction('addUser', {
    fullname: params.fullname,
    username: params.username,
    password: params.password,
    email: params.email,
    phone: params.phone,
    appType: ['food'],
    cityId: actor.pinnedRegion || params.cityId,
    enabled: true,
  });
}

/**
 * Saves a customer's profile through `editUser`.
 *
 * `appType` and `staffType` come from the fresh row, not the form: the function writes both
 * as given, so a customer who also drives would lose the driver app, and an admin who also
 * orders food would lose their role. No `password`: that is the reset dialog's.
 */
export async function updateCustomer(id: string, params: CustomerParams, actor: Actor): Promise<void> {
  const account = await accountForWrite(id, actor);
  await runFunction('editUser', {
    id,
    fullname: params.fullname,
    email: params.email,
    phone: params.phone,
    appType: account.appType ?? ['food'],
    cityId: actor.pinnedRegion || params.cityId,
    ...(account.staffType ? { staffType: account.staffType } : {}),
  });
}

/**
 * Gives a customer a new password through `editUser`, every other column sent back as it is.
 * Parse revokes every session of a user whose password changes, so this also signs them out
 * of the customer app everywhere.
 *
 * Refused for a row missing a column `editUser` insists on, rather than inventing one.
 */
export async function resetCustomerPassword(id: string, password: string, actor: Actor): Promise<void> {
  const account = await accountForWrite(id, actor);
  if (!account.fullname || !account.email || !account.phone || !account.regionId) {
    throw new Error('PARAMS_MISSING');
  }
  await runFunction('editUser', {
    id,
    fullname: account.fullname,
    email: account.email,
    phone: account.phone,
    appType: account.appType ?? ['food'],
    cityId: account.regionId,
    ...(account.staffType ? { staffType: account.staffType } : {}),
    password,
  });
}

/**
 * Enables or disables a customer through `toggleEnableUsers`.
 *
 * The function *flips* whatever it finds, so the row is re-read first and the call refused
 * unless it is still in the state ops saw — two consoles pressing "Disable" together must not
 * end with the account enabled. When the account runs a restaurant, the function switches
 * that restaurant and every one of its dishes the same way; the dialog says so first.
 */
export async function setCustomerEnabled(id: string, enabled: boolean, actor: Actor): Promise<void> {
  const row = await findOne<Pick<CustomerRow, 'objectId' | 'enabled' | 'city' | 'appType' | 'staffType'>>(USER, [
    { equalTo: { key: 'objectId', value: id } },
    { select: ['enabled', 'city', 'appType', 'staffType'] },
  ]);
  if (!row || !row.appType?.includes('food')) throw new Error(CUSTOMER_NOT_FOUND);
  if (actor.pinnedRegion && row.city?.objectId !== actor.pinnedRegion) throw new Error(CUSTOMER_NOT_FOUND);
  const block = manageBlockOf(row, actor.role, actor.selfId);
  if (block === 'staff') throw new Error(CUSTOMER_NOT_FOUND);
  if (block === 'self') throw new Error(CUSTOMER_IS_SELF);
  if ((row.enabled === true) === enabled) throw new Error(CUSTOMER_STATE_CHANGED);

  await runFunction('toggleEnableUsers', { ids: [id] });
}

/**
 * Deletes a customer account through `deleteUsers` — with it go their sessions, their saved
 * addresses and their picture. Their orders stay, pointing at an account that no longer
 * exists. Admin-only.
 *
 * Refused for an account that runs a restaurant: the function would delete the restaurant,
 * its menus, promos and reviews too (see `deleteBlockOf`).
 */
export async function deleteCustomer(id: string, actor: Actor): Promise<void> {
  if (actor.role !== 'admin') throw new Error(CUSTOMER_NOT_FOUND);
  const account = await accountForWrite(id, actor);
  if (deleteBlockOf({ managerStore: account.managerStore ? pointer('Restaurant', account.managerStore.objectId) : undefined })) {
    throw new Error(CUSTOMER_IS_MANAGER);
  }
  await runFunction('deleteUsers', { ids: [id] });
}
