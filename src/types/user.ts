import type { ParseGeoPointJSON, ParseObjectJSON, ParsePointer } from './parse';

/**
 * The subset of `_User` this console reads. Deliberately not the whole class: rows on
 * this backend also carry `pushToken`, `favorites`, `promosUsed`, `cartFood`, `authData`
 * and more, none of which ops has any business fetching.
 *
 * Everything but ParseObjectJSON is optional, per the rule in types/parse.ts: Parse rows
 * are sparse, and an account created before a field existed simply won't have it.
 */
export type SwitchUser = ParseObjectJSON & {
  username?: string;
  fullname?: string;
  email?: string;
  phone?: string;
  /** Which Switch apps this account has signed into — 'food', 'driver', 'manager',
   * 'staff'. Appended to by the apps themselves on login, so it is self-writable and can
   * never be the thing that grants access on its own. */
  appType?: string[];
  /** The staff role, when the account has one: 'Admin' or 'Staff'. Typed by hand in the
   * Parse dashboard — see lib/auth/access.ts. */
  staffType?: string;
  /** Access to this console, granted by an admin on /access. Only the `setOpsAccess`
   * cloud function writes it — see docs/ops-access-backend.md. Admins don't need it. */
  opsAccess?: boolean;
  /** The platform's own account switch, set to `true` at signup by every RN app. `false`
   * means the account is shut off entirely. */
  enabled?: boolean;
  /** The delivery region the account belongs to, as a pointer to `City`. Written by the
   * platform's `addUser` / `editUser` cloud functions from the Region field on the staff
   * dashboard's user form (switch-dashboard/src/pages/Users/Users.jsx:156), which refuses
   * to save an account without one.
   *
   * For a staff account this is not decoration: it is the only region they may look at.
   * See `regionScope` in lib/auth/access.ts. */
  city?: ParsePointer<'City'>;
  /** The account's preferred UI language, as switch-dashboard persists it
   * (navigation/stacks/MainStack.jsx). Read-only here — this console keeps its own
   * choice in localStorage; see lib/i18n. */
  language?: string;
};

/** A `_User` as it appears nested inside an `include`d order pointer — customer or
 * driver. Both are the same class; the roles differ only in which field points at them. */
export type OrderParty = ParseObjectJSON & {
  fullname?: string;
  phone?: string;
  username?: string;
};

/**
 * A `_User` read as a driver — the two columns the driver app keeps current on its own
 * row (switch-driver/src/screens/Home/Home.js).
 *
 * `driverLocation` is rewritten on real movement (30 m) or at the latest every minute
 * while the driver is online or carrying an order, which makes the row's `updatedAt` a
 * usable "last heard from" clock: a driver whose row has not moved in minutes has an app
 * that stopped reporting, whatever `driverActive` still says.
 */
export type DriverParty = OrderParty & {
  driverLocation?: ParseGeoPointJSON;
  /** The driver's own "GO" switch. The app flips it off while it carries an order, and
   * the platform refuses to assign an order to a driver with it off
   * (`DRIVER_DISCONNECTED`). */
  driverActive?: boolean;
  city?: ParsePointer<'City'>;
};
