import type { City } from './city';
import type { ParseFileJSON, ParseGeoPointJSON, ParseObjectJSON, ParsePointer } from './parse';
import type { DriverParty, OrderParty } from './user';

/**
 * One line of an order, keyed by the Food objectId it belongs to.
 *
 * The array this lives in (`options.values`) is **index-aligned with the order's `food`
 * pointer array** — line `i` describes dish `food[i]`, and the key inside it is
 * `food[i].objectId`. That is the backend's own convention
 * (switch-food/src/screens/OrderDetails/OrderDetails.js:385, and switch-dashboard reads
 * it the same way), not something derivable from the shape. Resolving a line without its
 * dish is therefore impossible, which is why `include: 'food'` is not optional on any
 * query behind this console.
 */
export type OrderLine = Record<
  string,
  {
    quantity?: number;
    price?: number;
    /** Chosen options — size, sauce, doneness. `value.name` is the choice. */
    variants?: { name?: string; value?: { name?: string } }[];
    /** Paid extras. The apps call these "supplements". */
    instructions?: { name?: string }[];
    /** A note the customer attached to this one dish, distinct from `options.note`. */
    note?: string;
  }
>;

/**
 * Every money figure on an order lives in this JSON column — there are no top-level
 * total columns. Written at checkout in switch-food/src/screens/Cart/Checkout.js:215-233:
 *
 *   total = itemsTotal - discount + service + delivery
 *
 * `itemsTotal` and `discount` are the restaurant's; `service` is the platform's per-city
 * fee; `delivery` is the driver's.
 */
export type OrderOptions = {
  itemsTotal?: number;
  discount?: number;
  /** Platform service fee (City.fees.food.service), 0 under a `freeall` promo. */
  service?: number;
  /** Delivery fee. Absent on pickup orders. */
  delivery?: number;
  /** True when a promo made delivery free — the fee was absorbed by the platform, not
   * charged to the customer, so it must not be counted as money collected. */
  freeDelivery?: boolean;
  total?: number;
  paymentMethod?: PaymentMethod;
  /** A note on the order as a whole — the address hint, the doorbell, the allergy. */
  note?: string;
  values?: OrderLine[];
};

export type PaymentMethod = 'cash' | 'creditcards';

export type DeliveryType = 'delivery' | 'pickup';

/** The `Promo` class, as far as an order needs it. */
export type Promo = ParseObjectJSON & {
  code?: string;
};

/**
 * A time of day as the `Restaurant` class stores it — `{ h: 18, mn: 30 }` — on the
 * restaurant's own wall clock, which is Algiers'. Written by switch-dashboard's Stores
 * form and switch-manager's Store screen.
 */
export type ClockTime = { h?: number; mn?: number };

/** The `Restaurant` class, narrowed to what an order row and the live map show. Always
 * read as the included `restaurant` of an order, so the hours below are as fresh as the
 * order itself. */
export type OrderRestaurant = ParseObjectJSON & {
  name?: string;
  phone?: string;
  manager?: ParsePointer<'_User'>;
  /** Free-text street address, as typed on switch-dashboard's Stores page. */
  address?: string;
  /** Where drivers collect from — the pin the driver app navigates to. */
  location?: ParseGeoPointJSON;
  picture?: ParseFileJSON;

  /** Opening hours, the same every working day. The platform has no hours that run past
   * midnight — see lib/ops/restaurant-hours.ts. */
  openTime?: ClockTime;
  closeTime?: ClockTime;
  /** A daily break inside those hours. Both set or both unset: the dashboard writes them
   * as a pair, and clears both when they are equal. */
  pauseStart?: ClockTime;
  pauseEnd?: ClockTime;
  /** The days it opens, as JavaScript weekday numbers (0 = Sunday). */
  workingDays?: number[];
  /** The restaurant's own on/off switch — "Pause" on switch-dashboard's Stores page, the
   * toggle in switch-manager. Off means customers can't order, whatever the hours say. */
  active?: boolean;
};

/**
 * The `Address` class — where a delivery goes. Written by the customer app
 * (switch-food/src/screens/Addresses/Addresses.js): `name` is the customer's own label
 * ("Home", "Work"), `address` the directions they typed, and `location` the pin they
 * dropped, which is the one the driver app navigates to.
 */
export type OrderAddress = ParseObjectJSON & {
  name?: string;
  address?: string;
  location?: ParseGeoPointJSON;
};

/** The `Food` class, narrowed to what a line item shows. */
export type OrderFood = ParseObjectJSON & {
  name?: string;
};

/**
 * The `Order` class. `objectId` doubles as the order number — the RN apps and
 * switch-dashboard render it as `'#' + objectId` and no separate reference column exists.
 *
 * `status` runs 0 placed → 1 confirmed → 2 onTheWay/prepared → 3 delivered/picked, with
 * the labels for 2 and 3 depending on `deliveryType`. `canceled` is a **separate flag
 * that overrides the status entirely** rather than a fifth status value: a canceled
 * order keeps whatever status it had reached. Both quirks are resolved once, in
 * lib/ops/order-status.ts.
 */
export type Order = ParseObjectJSON & {
  status?: number;
  canceled?: boolean;
  /** Set by the restaurant when the food is bagged — can be true while `status` is still
   * 1, which is exactly the window ops gets asked about ("is it ready yet?"). */
  isReady?: boolean;
  deliveryType?: DeliveryType;
  /** The vertical. Always 'food' on this backend today. Not filtered on by this console:
   * hiding a row because a field is unset is the wrong failure mode for a tool whose job
   * is to find the order someone is phoning about. */
  type?: string;
  /** Metres between restaurant and customer, as the driver app measured it. */
  distance?: number;
  /** Seconds of estimated travel time. */
  duration?: number;
  options?: OrderOptions;

  restaurant?: ParsePointer<'Restaurant'>;
  user?: ParsePointer<'_User'>;
  driver?: ParsePointer<'_User'>;
  city?: ParsePointer<'City'>;
  userAddress?: ParsePointer<'Address'>;
  promo?: ParsePointer<'Promo'>;
  food?: ParsePointer<'Food'>[];
};

/**
 * An order with every pointer the board renders resolved by `include`.
 *
 * Parse replaces an included pointer with the full nested object rather than leaving the
 * `{__type: 'Pointer', …}` stub, so these fields cannot reuse `Order`'s types as-is.
 * A pointer that was included but is genuinely unset (an order with no driver yet) still
 * comes back `undefined`, which is why every one of them stays optional.
 */
export type OrderRow = Omit<
  Order,
  'restaurant' | 'user' | 'driver' | 'city' | 'promo' | 'food'
> & {
  restaurant?: OrderRestaurant;
  user?: OrderParty;
  driver?: OrderParty;
  city?: City;
  promo?: Promo;
  food?: OrderFood[];
};

/**
 * An order as the live map reads it: the board's row plus the two things only a map
 * needs — where the delivery goes (`userAddress`, included) and where its driver is
 * (the included driver's own `driverLocation`).
 */
export type DispatchOrderRow = Omit<OrderRow, 'driver' | 'userAddress'> & {
  driver?: DriverParty;
  userAddress?: OrderAddress;
};
