import type { SwitchUser } from '@/types/user';

/**
 * Who may use Switch Ops, expressed once.
 *
 * Deliberately free of React and of the Parse SDK: the same rule is applied to the row
 * the session hook re-reads from the server and to the user object `become()` hands
 * back, two call sites that would otherwise each grow their own slightly different
 * version of the same ladder.
 *
 * **This is not the security boundary.** Sign-in goes through the `loginStaff` cloud
 * function, which authorizes server-side and refuses to mint a session for a
 * non-staff account (switch-dashboard/src/pages/Login/Login.jsx does the same). What
 * this rule adds is (a) the role label the shell shows, and (b) a re-check on every
 * page load, so an account demoted in the Parse dashboard stops seeing the console on
 * its next navigation instead of at session expiry.
 */
export type StaffRole = 'admin' | 'staff' | null;

/** The `staffType` value that means platform admin. */
export const ADMIN_STAFF_TYPE = 'Admin';

/**
 * Every `staffType` that makes an account staff. Nothing in code writes this field — the
 * RN apps' signup only clears it (`user.set("staffType", undefined)`), so it is typed by
 * hand in the Parse dashboard. These are the canonical spellings, not an enforced enum,
 * which is why every comparison against them is case-insensitive.
 */
export const STAFF_TYPES: readonly string[] = [ADMIN_STAFF_TYPE, 'Staff'];

/**
 * The `appType` members that mark an account as staff. Unlike `staffType` these are
 * machine-written and lowercase by convention — every app's `APP_TYPE` constant
 * ('food', 'driver', 'manager', 'staff') is — so they are matched exactly.
 */
export const STAFF_APP_TYPES: readonly string[] = ['staff', 'admin'];

/** Just the fields the rule reads — so callers can pass a full row or a projection. */
export type AccessFields = Pick<SwitchUser, 'staffType' | 'appType' | 'enabled' | 'city'>;

/**
 * Whether the account is staff at all. Both halves are required:
 *
 * - `staffType` names the role, and is the trustworthy half — it is only writable from
 *   the Parse dashboard.
 * - `appType` says which Switch apps the account belongs to, and is checked because an
 *   account can hold a `staffType` from a past role without being provisioned for the
 *   staff app. It cannot carry the rule on its own: the consumer app appends to
 *   `appType` on every login, so it is self-writable by design.
 */
export function isStaffAccount(user: AccessFields | null | undefined): boolean {
  if (!user) return false;

  const staffType = user.staffType?.trim().toLowerCase();
  if (!staffType || !STAFF_TYPES.some((type) => type.toLowerCase() === staffType)) return false;

  return user.appType?.some((type) => STAFF_APP_TYPES.includes(type)) ?? false;
}

/**
 * The ladder, in order:
 *
 * 1. `enabled === false` denies unconditionally — a shut-off account stays shut off even
 *    if it is an admin. Note the explicit `=== false`: a row that never had the field
 *    written is not a disabled account, and treating `undefined` as "disabled" would
 *    lock out every account older than the field.
 * 2. Not staff → denied, admins included.
 * 3. `staffType === 'Admin'` → admin, otherwise staff. Compared case-insensitively:
 *    this vocabulary lives in the Parse dashboard where a human types it.
 */
export function staffRole(user: AccessFields | null | undefined): StaffRole {
  if (!user) return null;
  if (user.enabled === false) return null;
  if (!isStaffAccount(user)) return null;
  return user.staffType?.trim().toLowerCase() === ADMIN_STAFF_TYPE.toLowerCase()
    ? 'admin'
    : 'staff';
}

export function canAccessOps(user: AccessFields | null | undefined): boolean {
  return staffRole(user) !== null;
}

/**
 * Which delivery regions an account is allowed to look at.
 *
 * - `all` — an admin. The region filter behaves as it always has.
 * - `single` — a staff account, confined to the one region on its own `city` pointer.
 *   Every order query is pinned to it and the region filter is locked; see
 *   `confineToRegion` in lib/url/order-filters.ts.
 * - `unassigned` — a staff account whose row carries no region at all.
 *
 * The third case exists because Parse rows are sparse. The dashboard's user form
 * requires a region, so an account without one is either older than that rule or was
 * written by hand — and the answer to "which region may they see" is genuinely *none*,
 * not *all*. Widening to everything would hand the whole platform to exactly the
 * accounts this rule exists to confine, so it is reported as its own state and the shell
 * turns it into a screen that names the problem (see components/require-auth.tsx). An
 * empty board would be the alternative, and that reads as a bug rather than as
 * "somebody needs to assign you a region".
 */
export type RegionScope =
  | { kind: 'all' }
  | { kind: 'single'; regionId: string }
  | { kind: 'unassigned' };

/**
 * Deliberately not `null` for an account with no access at all — the caller has already
 * refused those on `staffRole`, and `unassigned` is the safe answer to give a row this
 * rule cannot vouch for either way.
 */
export function regionScope(user: AccessFields | null | undefined): RegionScope {
  if (staffRole(user) === 'admin') return { kind: 'all' };
  const regionId = user?.city?.objectId;
  return regionId ? { kind: 'single', regionId } : { kind: 'unassigned' };
}

/** The region a scope pins queries to, or `''` when it pins nothing (an admin). */
export function pinnedRegionId(scope: RegionScope): string {
  return scope.kind === 'single' ? scope.regionId : '';
}
