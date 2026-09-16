import { STAFF_APP_TYPES, type StaffRole } from '@/lib/auth/access';
import type { CustomerRow } from '@/types/customer';

/**
 * What the Customers screens know about an account, decided once from plain rows.
 *
 * Free of React and Parse, like lib/ops/drivers.ts — the list, the detail and every dialog
 * read their answers from here, so none of them can disagree about whether an account may
 * be touched.
 */

export const CUSTOMER_STATUSES = ['enabled', 'disabled'] as const;

export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

/**
 * `enabled !== true` rather than `=== false`: a row that never had the field written is one
 * `beforeLogin` refuses, so to this screen it is disabled too — the same reading
 * lib/ops/drivers.ts gives it.
 */
export function customerStatusOf(row: Pick<CustomerRow, 'enabled'>): CustomerStatus {
  return row.enabled === true ? 'enabled' : 'disabled';
}

/**
 * The `staffType` spellings a staff account can carry — typed by hand in the Parse
 * dashboard, so every casing that plausibly exists. Used as a query constraint, which
 * can't compare case-insensitively.
 */
export const STAFF_TYPE_SPELLINGS = ['Admin', 'Staff', 'admin', 'staff', 'ADMIN', 'STAFF'];

/**
 * An account that is also staff — a customer who works at Switch. Staff accounts never see
 * these rows; admins see them marked, and may manage them (the user's rule: "admins only").
 */
export function isStaffTagged(row: Pick<CustomerRow, 'staffType' | 'appType'>): boolean {
  if (row.staffType?.trim()) return true;
  return row.appType?.some((type) => STAFF_APP_TYPES.includes(type)) ?? false;
}

/**
 * Why this signed-in account may not change a customer account, or null when it may.
 *
 * - `self` — nobody disables, deletes or re-passwords their own account from a list of
 *   customers; the account menu is where you are you.
 * - `staff` — a staff-tagged account, for anyone but an admin.
 */
export type ManageBlock = 'self' | 'staff';

export function manageBlockOf(
  row: Pick<CustomerRow, 'objectId' | 'staffType' | 'appType'>,
  role: StaffRole,
  selfId: string | undefined,
): ManageBlock | null {
  if (selfId && row.objectId === selfId) return 'self';
  if (isStaffTagged(row) && role !== 'admin') return 'staff';
  return null;
}

/**
 * Why a customer account can't be deleted even by an admin, or null.
 *
 * `manager`: `deleteUsers` deletes the restaurant an account runs — its menus, promos and
 * reviews with it — as a side effect of deleting a person. From a Customers screen that is
 * never what was meant, so the account has to be taken off its restaurant first (on the
 * restaurant's page, Manager → Remove).
 */
export function deleteBlockOf(row: Pick<CustomerRow, 'managerStore'>): 'manager' | null {
  return row.managerStore?.objectId ? 'manager' : null;
}

/** OAuth providers worth naming. `anonymous` is left out: it is how the customer app browses
 * before sign-up, not a way this person signs in. */
export function signInProvidersOf(authData: unknown): string[] {
  if (!authData || typeof authData !== 'object') return [];
  return Object.keys(authData)
    .filter((provider) => provider !== 'anonymous')
    .sort();
}

/**
 * What a phone search matches, as a substring of the stored number.
 *
 * Numbers are stored E.164 (`+213550123456`) and typed by ops the way they're written down
 * (`0550 12 34 56`), so the digits are compared without the dialling code's own leading
 * zero: `0550…` becomes `550…`, which the stored number contains. Returns '' when nothing
 * typed is a digit.
 */
export function phoneSearchDigits(query: string): string {
  const digits = query.replace(/\D/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return digits.slice(1);
  return digits;
}
