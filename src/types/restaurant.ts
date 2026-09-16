import type { City } from './city';
import type { ClockTime } from './order';
import type { ParseFileJSON, ParseGeoPointJSON, ParseObjectJSON, ParsePointer } from './parse';

/**
 * The catalogue classes ops manages — `Restaurant`, its menus (`List`) and their dishes
 * (`Food`) — as switch-dashboard's Stores, Lists and Products pages write them
 * (src/pages/Stores/Stores.jsx and its siblings). Field names are the backend's, including
 * the ones that don't say what they mean; each is explained where it is declared.
 */

/** The `Category` class — a cuisine a restaurant is filed under ("Pizza", "Burgers").
 * Admin-managed on the dashboard; ops only picks from it. */
export type Category = ParseObjectJSON & {
  name?: string;
  picture?: ParseFileJSON;
  /** The label in each app language, keyed 'en' / 'fr' / 'ar'. `name` is the admin's own
   * internal label and is the fallback. */
  translations?: Record<string, string>;
};

/** A `_User` as it appears as a restaurant's included `manager` — the manager-app account
 * that runs the kitchen's side of an order. */
export type RestaurantManager = ParseObjectJSON & {
  fullname?: string;
  username?: string;
  phone?: string;
};

/**
 * The `Restaurant` class.
 *
 * Three switches, easy to mix up:
 *
 * - `enabled` — on the platform at all. Off hides it from customers, and (through
 *   `toggleEnableStores`) also switches off its menus, dishes and manager account.
 * - `active` — "Pause". Off means customers can't order right now, whatever the hours say;
 *   the manager app flips it too.
 * - `isFeatured` — shown in the customer app's featured rail.
 */
export type Restaurant = ParseObjectJSON & {
  name?: string;
  /** `name` lower-cased, written alongside it for the customer app's search. */
  searchName?: string;
  description?: string;
  address?: string;
  /** One number or several joined by '/'. See `splitPhones` in lib/format.ts. */
  phone?: string;
  picture?: ParseFileJSON;
  location?: ParseGeoPointJSON;

  openTime?: ClockTime;
  closeTime?: ClockTime;
  /** A daily break, both set or both null — see `OrderRestaurant` in types/order.ts. */
  pauseStart?: ClockTime | null;
  pauseEnd?: ClockTime | null;
  workingDays?: number[];

  enabled?: boolean;
  active?: boolean;
  isFeatured?: boolean;

  /**
   * The commission rate Switch bills the restaurant, as a fraction (0.15 = 15%) — the
   * number switch-finance's invoices multiply by. Orders carry no copy of it, so changing
   * it re-prices every past invoice too. Admin-only in this console.
   */
  fee?: number;

  /** Kept by the platform, never written here. */
  rating?: number;
  reviews?: number;
  ordersTotal?: number;
  ordersAccepted?: number;
};

/** A restaurant with the three pointers every screen here shows resolved by `include`. */
export type RestaurantRow = Restaurant & {
  city?: City;
  manager?: RestaurantManager;
  /** A category deleted on the dashboard can linger here as a bare pointer, so read
   * `translations` and `name` as optional even on an included row. */
  categories?: Category[];
};

/** The `List` class — a section of a restaurant's menu ("Pizzas", "Drinks"). */
export type Menu = ParseObjectJSON & {
  name?: string;
  enabled?: boolean;
  restaurant?: ParsePointer<'Restaurant'>;
};

/** A menu with its restaurant (and that restaurant's city) included — what the products
 * page needs to name where it is and to check the region. */
export type MenuWithRestaurant = Omit<Menu, 'restaurant'> & {
  restaurant?: RestaurantRow;
};

/** A menu on the restaurant page, with how many dishes it holds. */
export type MenuRow = Menu & { productCount: number };

/**
 * A paid extra on a dish — "Extra cheese +50". The customer app calls these "instructions"
 * in code and "supplements" on screen. `id` is a random 8-digit string the dashboard mints;
 * the customer's basket refers to it.
 */
export type Supplement = { id: string; name: string; cost: number };

/**
 * A heading over a run of supplements, with an optional minimum and maximum pick count.
 *
 * `from`/`to` are **indexes into the dish's supplement array**, `to` exclusive — the
 * customer app shows `instructions.slice(from, to)` under the heading
 * (switch-food/src/screens/Food/Food.js), so reordering supplements moves them between
 * groups. Once a dish has any group, a supplement outside every group is not shown at all.
 * `min`/`max` are only checked when truthy, which is why the dashboard stores an empty one
 * as `''` or `null`.
 */
export type SupplementGroup = {
  name: string;
  from: number;
  to: number;
  min?: number | null | '';
  max?: number | null | '';
};

/** One choice inside a variant — "Large +200". */
export type VariantOption = { name: string; cost: number };

/** A choice the customer makes once per dish — size, crust, doneness. */
export type Variant = { id: string; name: string; values: VariantOption[] };

/** The `Food` class — a dish. */
export type Product = ParseObjectJSON & {
  name?: string;
  description?: string;
  picture?: ParseFileJSON;
  price?: number;
  /** The price actually charged when it is above 0 and below `price` (0 = no discount). */
  discountPrice?: number;
  /** Written alongside `discountPrice`; the customer app's Promo tab filters on it. */
  isDiscount?: boolean;
  enabled?: boolean;
  instructions?: Supplement[];
  headers?: SupplementGroup[];
  variants?: Variant[];
  restaurant?: ParsePointer<'Restaurant'>;
  list?: ParsePointer<'List'>;
  /** Copied from the restaurant; `changeRegion` rewrites it on every dish. */
  city?: ParsePointer<'City'>;
};

/** The `Review` class, as a restaurant's review list shows it. */
export type Review = ParseObjectJSON & {
  rating?: number;
  review?: string;
  picture?: ParseFileJSON;
  user?: ParseObjectJSON & { fullname?: string; phone?: string };
};

/**
 * A `_User` looked up by id before being made a restaurant's manager. `managerStore` is the
 * restaurant the manager app opens for them — a single pointer, so an account can run one
 * restaurant at a time.
 */
export type ManagerCandidate = ParseObjectJSON & {
  fullname?: string;
  username?: string;
  phone?: string;
  appType?: string[];
  enabled?: boolean;
  staffType?: string;
  managerStore?: ParsePointer<'Restaurant'>;
};
