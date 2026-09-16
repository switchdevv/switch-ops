import type { ParseFileJSON, ParseObjectJSON, ParsePointer } from './parse';
import type { Restaurant } from './restaurant';

/**
 * A manager account, as the Managers screens read it — a `_User` row whose `appType` holds
 * 'manager'.
 *
 * Narrowed like every other `_User` read in this console (see types/user.ts). `email` is
 * missing on purpose: Parse hides it from a session read, so it only arrives through
 * `getUsers` (see `DriverAccount`, which the Managers screens read the account into too —
 * the same function, the same fields).
 */

/**
 * The restaurant a manager runs, included on their row.
 *
 * `manager` stays a bare pointer: it is only read to check that the restaurant still names
 * this account back — `assignManager` moves a `managerStore` without clearing the old
 * restaurant's `manager`, so the two can disagree (see `restaurantLinkOf` in
 * lib/ops/managers.ts).
 *
 * A restaurant deleted since arrives as the pointer alone, with no `createdAt`.
 */
export type ManagerRestaurant = Restaurant & {
  manager?: ParsePointer<'_User'> | null;
  city?: ParsePointer<'City'>;
};

export type ManagerRow = ParseObjectJSON & {
  fullname?: string;
  username?: string;
  phone?: string;
  picture?: ParseFileJSON;
  appType?: string[];
  /** Set on a staff account. A row that has one is refused by every write on this screen —
   * see `isProtectedAccount` in lib/ops/drivers.ts. */
  staffType?: string;
  /**
   * The account switch. `beforeLogin` refuses a sign-in without it. Flipped — never set —
   * by `toggleEnableUsers`, which also flips the manager's restaurant and its dishes.
   */
  enabled?: boolean;
  city?: ParsePointer<'City'>;
  /**
   * The restaurant the manager app opens. Without one the app stops at its "account not
   * set up" screen (switch-manager navigation/root.js: `appType.includes('manager') &&
   * managerStore`). Written only by `assignManager`.
   */
  managerStore?: ManagerRestaurant | null;
};
