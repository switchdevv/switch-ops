import type { ParseFileJSON, ParseGeoPointJSON, ParseObjectJSON, ParsePointer } from './parse';

/**
 * A customer account, as the Customers list reads it — a `_User` row whose `appType`
 * contains 'food'.
 *
 * Narrowed like every other `_User` read in this console (see types/user.ts). It is also
 * narrowed by necessity: the class's protectedFields hide `email`, `cartFood`,
 * `promosUsed`, `favorites` and `payment` from a session read, so a plain query can't
 * return them however it is written. Those arrive only through `getUsers` — see
 * `CustomerAccount`.
 */
export type CustomerRow = ParseObjectJSON & {
  fullname?: string;
  username?: string;
  phone?: string;
  picture?: ParseFileJSON;
  appType?: string[];
  /** Set on a staff account. Staff never see such a row here; an admin sees it marked. */
  staffType?: string;
  /** The account switch. `beforeLogin` refuses a sign-in without it. Flipped — never set —
   * by `toggleEnableUsers`. */
  enabled?: boolean;
  /** A bare pointer; the name comes from the cached `City` list (hooks/use-cities.ts). */
  city?: ParsePointer<'City'>;
  /** Set when the account also runs a restaurant. Disabling or deleting the account reaches
   * that restaurant too — see lib/ops/customers.ts. */
  managerStore?: ParsePointer<'Restaurant'>;
};

/** A saved delivery address — the `Address` class, written by the customer app
 * (switch-food/src/screens/Addresses). `name` is the customer's own label. */
export type CustomerAddress = ParseObjectJSON & {
  name?: string;
  address?: string;
  location?: ParseGeoPointJSON;
};

/**
 * The account behind a customer, read through `getUsers` (master key) for everything a
 * session read can't see.
 *
 * Deliberately a narrowed copy rather than the raw cloud result: that function returns the
 * whole row — push tokens, the payment object and the OAuth tokens inside `authData` — and
 * none of it should reach a React Query cache. `lib/services/customers.ts` keeps exactly
 * these fields and drops the rest at the boundary; the arrays are reduced to their counts,
 * and `authData` to the names of its providers.
 */
export type CustomerAccount = {
  objectId: string;
  createdAt?: string;
  updatedAt?: string;
  fullname?: string;
  username?: string;
  email?: string;
  phone?: string;
  pictureUrl?: string;
  /** Sent back to `editUser` untouched, so an account that is also a driver or a manager
   * keeps that half. */
  appType?: string[];
  /** Sent back to `editUser` untouched too: that function writes `staffType` whether or
   * not it is given, so leaving it out would strip an admin of their role. */
  staffType?: string;
  enabled?: boolean;
  /** The region's objectId, or '' when the row has none. */
  regionId: string;
  /** Dishes sitting in their cart right now. */
  cartCount: number;
  /** Promo redemptions — one entry per use, so a code used twice counts twice. */
  promosUsedCount: number;
  favoritesCount: number;
  /** 'google', 'facebook', 'apple'… — how they sign in besides a password. */
  signInProviders: string[];
  /** Their default delivery address, as the customer app last chose it. */
  address: CustomerAddress | null;
  managerStore: { objectId: string; name?: string } | null;
};

/** How many orders a customer has placed, by outcome. */
export type CustomerOrderStats = {
  total: number;
  delivered: number;
  canceled: number;
};
