import { isAdminStaffType, STAFF_APP_TYPES } from '@/lib/auth/access';
import { STAFF_TYPE_SPELLINGS } from '@/lib/ops/customers';
import { runFunction } from '@/lib/parse/cloud';
import { findOne, findWithCount, type PageResult, type QueryParam } from '@/lib/parse/query';
import type { AccessFilters } from '@/lib/url/access-filters';
import type { SwitchUser } from '@/types/user';

const COLLECTION = '_User';

export const STAFF_PAGE_SIZE = 25;

/**
 * Re-reads the signed-in account's own row — the role, grant and region the console runs
 * on, and the profile the account menu shows.
 *
 * Still narrowed with `select`: this is a `_User` row, and there is no reason for an
 * operations console to pull an account's push token, cart or auth data across the wire.
 * Everything listed is something the shell renders or the access rule reads.
 *
 * `city` comes back as a bare pointer, and that is all that is wanted — the account
 * menu names the region from the `City` list the board has already cached, so adding an
 * `include` here would buy a second copy of a row the app is holding anyway (and Parse
 * is unreliable about `select` and `include` together — see lib/services/orders.ts).
 */
export function getAccessFor(objectId: string): Promise<SwitchUser | null> {
  return findOne<SwitchUser>(COLLECTION, [
    { equalTo: { key: 'objectId', value: objectId } },
    {
      select: [
        'username',
        'fullname',
        'email',
        'phone',
        'staffType',
        'appType',
        'opsAccess',
        'enabled',
        'city',
      ],
    },
  ]);
}

/* ---- the Access page -------------------------------------------------------- */

/** The columns a row on /access shows. `email` is not among them: `_User` hides it from a
 * session read, and a username is what an admin knows a staff account by. */
const LIST_FIELDS = ['username', 'fullname', 'phone', 'appType', 'staffType', 'opsAccess', 'enabled', 'city'];

const ADMIN_SPELLINGS = STAFF_TYPE_SPELLINGS.filter((type) => isAdminStaffType(type));
const STAFF_SPELLINGS = STAFF_TYPE_SPELLINGS.filter((type) => !isAdminStaffType(type));

/**
 * The staff pool /access lists — the server-side spelling of `isStaffAccount`, so the page
 * can't list an account the gate would never let in, or hide one it does.
 *
 * Both halves are `containedIn`, which Parse reads correctly per column: on `appType`, an
 * array, it matches a row holding any of the values; on `staffType`, a string, a row equal
 * to any. `staffType` is enumerated in every casing because the gate compares it
 * case-insensitively and a query can't.
 *
 * The access filter narrows `staffType` itself — admins for "admins", staff otherwise —
 * because "has access" and "no access" are about staff accounts only. `notEqualTo: true`
 * rather than `equalTo: false` for "no access": the field is new, and most rows have never
 * had it written.
 */
function listParams(filters: AccessFilters): QueryParam[] {
  const staffTypes =
    filters.access === 'all' ? STAFF_TYPE_SPELLINGS : filters.access === 'admins' ? ADMIN_SPELLINGS : STAFF_SPELLINGS;

  return [
    { containedIn: { key: 'appType', value: [...STAFF_APP_TYPES] } },
    { containedIn: { key: 'staffType', value: staffTypes } },
    filters.access === 'granted' ? { equalTo: { key: 'opsAccess', value: true } } : {},
    filters.access === 'denied' ? { notEqualTo: { key: 'opsAccess', value: true } } : {},
    // Anywhere in the username, ignoring case — there is no lowercased copy of the column.
    // The value is regex-escaped in lib/parse/query.ts.
    filters.query ? { matches: { key: 'username', value: filters.query, modifiers: 'i' } } : {},
  ];
}

/** Alphabetical by username: this is a list an admin scans for one person. */
export function listStaff(filters: AccessFilters, page: number): Promise<PageResult<SwitchUser>> {
  return findWithCount<SwitchUser>(COLLECTION, [
    ...listParams(filters),
    { select: LIST_FIELDS },
    { ascending: 'username' },
    // A tiebreak, so two rows can't swap pages between reads.
    { addAscending: 'objectId' },
    { limit: STAFF_PAGE_SIZE },
    { skip: (page - 1) * STAFF_PAGE_SIZE },
  ]);
}

/**
 * Grants or revokes one staff account's Ops access, through `setOpsAccess`.
 *
 * A cloud function because it has to be: a `_User` row is writable by its owner only, and
 * the owner is exactly who must not decide this. None of the platform's existing functions
 * can write the field (`editUser` writes a fixed list), so this is a new one, specified —
 * with the trigger that stops an account granting itself — in docs/ops-access-backend.md,
 * like switch-finance's `setFinanceAccess`. Until it is deployed every call fails with 141
 * "Invalid function", which `parseErrorKey(…, 'access')` names as such.
 */
export function setOpsAccess(userId: string, granted: boolean): Promise<unknown> {
  return runFunction('setOpsAccess', { userId, granted });
}
