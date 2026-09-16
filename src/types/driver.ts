import type { ParseFileJSON, ParseGeoPointJSON, ParseObjectJSON, ParsePointer } from './parse';

/**
 * A driver account, as the Drivers screens read it — a `_User` row whose `appType`
 * contains 'driver'.
 *
 * Narrowed like every other `_User` read in this console (see types/user.ts): a row here
 * also carries `pushToken`, `favorites`, `cartFood` and `authData`, none of which ops has
 * any business fetching. `email` is missing on purpose — Parse hides it from a session
 * read through the class's protectedFields, so it only ever arrives through `getUsers`,
 * which runs with the master key. See `DriverAccount`.
 */

/**
 * The running tally behind `driverRating`, written by the platform when a customer
 * reviews a delivery. Rows created before the field existed have nothing here, and
 * `addUser` writes `{ratingTotal: 0, reviews: 0}` — so a driver with no reviews is
 * `reviews: 0`, not a missing object. Read both defensively anyway.
 */
export type DriverParams = {
  ratingTotal?: number;
  reviews?: number;
};

export type DriverRow = ParseObjectJSON & {
  fullname?: string;
  username?: string;
  phone?: string;
  picture?: ParseFileJSON;
  appType?: string[];
  /** Set on a staff account. A row that has one is refused by every write on this screen
   * — see `isProtectedAccount` in lib/ops/drivers.ts. */
  staffType?: string;
  /**
   * The account switch, and the one this screen calls "active".
   *
   * `beforeLogin` refuses a sign-in without it, and `assignDriver` refuses the driver, so
   * a driver with it off can neither work nor be sent anything. It is flipped — never set
   * — by `toggleEnableUsers`.
   */
  enabled?: boolean;
  /** The driver's own region. A bare pointer: the region's name comes from the `City`
   * list the console already caches (see hooks/use-cities.ts). */
  city?: ParsePointer<'City'>;
  /** The driver's own GO switch, flipped only by the driver app. Never a substitute for
   * "online" on its own — see `DRIVER_ONLINE_WINDOW_MS` in lib/ops/dispatch.ts. */
  driverActive?: boolean;
  driverLocation?: ParseGeoPointJSON;
  driverRating?: number;
  driverParams?: DriverParams | null;
  driverOrdersAccepted?: number;
};

/**
 * The account behind a driver, read fresh through `getUsers` before any write.
 *
 * Deliberately a narrowed copy rather than the raw cloud result: that function returns the
 * whole `_User` row, push tokens and auth data included, and none of it should reach a
 * React Query cache. `lib/services/drivers.ts` keeps exactly these fields and drops the
 * rest at the boundary.
 */
export type DriverAccount = {
  objectId: string;
  fullname?: string;
  username?: string;
  email?: string;
  phone?: string;
  /** Kept as it is and sent back to `editUser` untouched, so a driver who is also a
   * customer ('food') doesn't lose that half of their account to an ops edit. */
  appType?: string[];
  staffType?: string;
  enabled?: boolean;
  /** The region's objectId, or '' when the row has none. */
  regionId: string;
};
