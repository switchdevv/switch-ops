import type { MessageKey } from '@/lib/i18n/dictionary';
import type { City } from '@/types/city';
import type { DispatchOrderRow, OrderRestaurant } from '@/types/order';
import type { ParseGeoPointJSON } from '@/types/parse';
import type { DriverParty } from '@/types/user';
import { isUnassignedDelivery, stageOf, STALE_AFTER_MS } from './order-status';
import { algiersClock, restaurantHours, type RestaurantHours } from './restaurant-hours';

/**
 * The live map's model of the queue: what is open, where each restaurant and customer
 * is, and which drivers could take the work.
 *
 * Deliberately free of React, Parse and MapLibre. Every rule a dispatcher relies on —
 * which colour means "act now", who counts as free, who is "nearest" — is decided here,
 * once, from plain rows, so the panel, the pins and the lines on the map cannot disagree
 * about it.
 */

/** A position. Named fields rather than a tuple on purpose: Parse speaks lat/lng while
 * GeoJSON and MapLibre speak lng/lat, and an anonymous `[a, b]` is exactly how the two
 * get swapped without anything noticing. */
export type LatLng = { lat: number; lng: number };

/**
 * A GeoPoint as something that can go on a map, or null when it can't.
 *
 * `0` on either axis is treated as unset, which is the platform's own convention: the
 * customer app refuses to save an address there
 * (switch-food/src/screens/ChooseLocation/ChooseLocation.js), and the driver app's map
 * starts at 0,0 before its first fix. A pin in the Gulf of Guinea helps nobody.
 */
export function toLatLng(
  point: Partial<Pick<ParseGeoPointJSON, 'latitude' | 'longitude'>> | null | undefined,
): LatLng | null {
  const lat = point?.latitude;
  const lng = point?.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 || lng === 0) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** A region's service area as map positions, or empty when it has none drawn. */
export function regionOutline(city: Pick<City, 'geofence'> | null | undefined): LatLng[] {
  return (city?.geofence?.coordinates ?? [])
    .map(([latitude, longitude]) => toLatLng({ latitude, longitude }))
    .filter((point): point is LatLng => point !== null);
}

const EARTH_RADIUS_M = 6_371_000;

/**
 * Straight-line (great-circle) distance in metres.
 *
 * There is no routing engine behind this console, so "nearest" means as the crow flies —
 * which is how the screen labels it. Across one city that ranks drivers the same way road
 * distance would in all but the river-and-motorway cases, and a dispatcher looking at the
 * map can see those for themselves.
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/* ---- orders ------------------------------------------------------------------ */

/**
 * What an open order needs from ops, in the order a dispatcher deals with them.
 *
 * Not the board's five stages: those describe where an order *is*, and a map for
 * dispatch has to say what to *do*. The board's stage is still one click away, on the
 * order's chip.
 *
 * - `needsDriver` — a delivery the restaurant has accepted that nobody is carrying.
 *   Dispatch on this platform is manual — nothing assigns a driver on its own — so this
 *   is ops' own queue: nothing moves until someone here picks a driver.
 * - `awaitingRestaurant` — placed, not yet accepted. The call to make is to the
 *   restaurant; a delivery here moves to `needsDriver` the moment it is accepted.
 * - `withDriver` — a driver has it, on the way to the restaurant or to the customer.
 * - `pickup` — the customer collects it; there is nothing to dispatch.
 *
 * The board's "needs a driver" banner counts unaccepted deliveries too (see
 * `isUnassignedDelivery`). The map keeps those amber until the restaurant accepts, so its
 * red number is the orders a driver should be sent to *now* — sending one to a kitchen
 * that may still refuse the order is a wasted trip. Assigning early is still allowed, as
 * it is on switch-dashboard; see `isAssignable`.
 */
export const ORDER_PHASES = ['needsDriver', 'awaitingRestaurant', 'withDriver', 'pickup'] as const;

export type OrderPhase = (typeof ORDER_PHASES)[number];

const PHASE_RANK: Record<OrderPhase, number> = {
  needsDriver: 0,
  awaitingRestaurant: 1,
  withDriver: 2,
  pickup: 3,
};

/**
 * The colour each phase paints with. Red is reserved for the one state that is an alarm,
 * and green is not used by any order at all — on this screen green means "a driver who
 * is free", and an order sharing it would make the one question the map exists to answer
 * ambiguous.
 */
export const PHASE_COLOR_VAR: Record<OrderPhase, string> = {
  needsDriver: 'var(--danger)',
  awaitingRestaurant: 'var(--warning)',
  withDriver: 'var(--accent)',
  pickup: 'var(--faint)',
};

/** What stays legible *on* each phase colour — the palette's own paired foreground, so a
 * count on an amber badge is dark and one on a red badge is white. */
export const PHASE_ON_COLOR_VAR: Record<OrderPhase, string> = {
  needsDriver: 'var(--danger-foreground)',
  awaitingRestaurant: 'var(--warning-foreground)',
  withDriver: 'var(--accent-foreground)',
  pickup: 'var(--default-foreground)',
};

export const PHASE_LABEL_KEY: Record<OrderPhase, MessageKey> = {
  needsDriver: 'dispatch.phase.needsDriver',
  awaitingRestaurant: 'dispatch.phase.awaitingRestaurant',
  withDriver: 'dispatch.phase.withDriver',
  pickup: 'dispatch.phase.pickup',
};

export const PHASE_HINT_KEY: Record<OrderPhase, MessageKey> = {
  needsDriver: 'dispatch.phaseHint.needsDriver',
  awaitingRestaurant: 'dispatch.phaseHint.awaitingRestaurant',
  withDriver: 'dispatch.phaseHint.withDriver',
  pickup: 'dispatch.phaseHint.pickup',
};

/** An order's phase, or null when it is finished or canceled and so not the map's business. */
export function phaseOf(order: DispatchOrderRow): OrderPhase | null {
  const stage = stageOf(order);
  if (stage === 'new') return 'awaitingRestaurant';
  if (stage !== 'confirmed' && stage !== 'active') return null;
  if (order.deliveryType !== 'delivery') return 'pickup';
  return isUnassignedDelivery(order) ? 'needsDriver' : 'withDriver';
}

/* ---- drivers ----------------------------------------------------------------- */

/**
 * - `available` — online and carrying nothing: someone who can be sent.
 * - `busy` — carrying at least one open order.
 * - `signalLost` — online according to their row, but the app has stopped reporting.
 *   Usually a phone that killed the app in the background; they may still answer a call,
 *   but they are no longer where the map says.
 */
export const DRIVER_STATES = ['available', 'busy', 'signalLost'] as const;

export type DriverState = (typeof DRIVER_STATES)[number];

/**
 * How long a driver can go without a position write before the map stops trusting it.
 * The driver app writes at least once a minute while online or on an order (its
 * `LOCATION_MAX_INTERVAL`), so three missed heartbeats is a dead app, not a slow one.
 */
export const DRIVER_SIGNAL_TIMEOUT_MS = 3 * 60 * 1000;

/**
 * How long ago a driver must have been heard from to count as online at all.
 *
 * `driverActive` is a switch the driver app turns off on sign-out — and never gets to
 * turn off when the app is uninstalled, crashes for good, or the phone is replaced. Those
 * rows keep the flag `true` forever, so the online-drivers query returns drivers last
 * seen *years* ago, and they arrived on this board as "signal lost" alongside someone who
 * dropped out five minutes ago. They are not the same thing and only one of them is worth
 * a phone call.
 *
 * Two hours is far longer than any real gap — a working driver writes every minute, and
 * the app takes itself offline within minutes of being backgrounded — while still keeping
 * anyone who genuinely dropped out during this evening's service.
 *
 * A driver carrying an open order is never dropped by this rule, however old their last
 * position is: the order is live, so the person is part of tonight whether or not their
 * app is reporting.
 */
export const DRIVER_ONLINE_WINDOW_MS = 2 * 60 * 60 * 1000;

export const DRIVER_COLOR_VAR: Record<DriverState, string> = {
  available: 'var(--success)',
  busy: 'var(--accent)',
  signalLost: 'var(--faint)',
};

export const DRIVER_ON_COLOR_VAR: Record<DriverState, string> = {
  available: 'var(--success-foreground)',
  busy: 'var(--accent-foreground)',
  signalLost: 'var(--default-foreground)',
};

export const DRIVER_STATE_LABEL_KEY: Record<DriverState, MessageKey> = {
  available: 'dispatch.driverState.available',
  busy: 'dispatch.driverState.busy',
  signalLost: 'dispatch.driverState.signalLost',
};

export const DRIVER_STATE_HINT_KEY: Record<DriverState, MessageKey> = {
  available: 'dispatch.driverStateHint.available',
  busy: 'dispatch.driverStateHint.busy',
  signalLost: 'dispatch.driverStateHint.signalLost',
};

const DRIVER_STATE_RANK: Record<DriverState, number> = { available: 0, busy: 1, signalLost: 2 };

/* ---- the model --------------------------------------------------------------- */

export type EntityKind = 'order' | 'restaurant' | 'driver';

/** One thing the dispatcher has picked, on the map or in the panel. */
export type DispatchSelection = { kind: EntityKind; id: string };

/** The id a pin, a list row and a highlight share. Namespaced because a restaurant and
 * an order are different classes that could, in principle, share an objectId. */
export function entityKey(kind: EntityKind, id: string): string {
  return `${kind}:${id}`;
}

export function selectionKey(selection: DispatchSelection | null): string | null {
  return selection ? entityKey(selection.kind, selection.id) : null;
}

export type DispatchOrder = {
  key: string;
  id: string;
  row: DispatchOrderRow;
  phase: OrderPhase;
  /** Epoch ms the order was placed — the clock every "waiting" on this screen reads. */
  placedAt: number;
  /** The restaurant, where a driver collects. */
  pickup: LatLng | null;
  /** The customer's pin. Null for a pickup, where the customer comes to the food. */
  dropoff: LatLng | null;
  restaurantId: string | null;
  driverId: string | null;
};

export type DispatchRestaurant = {
  key: string;
  id: string;
  row: OrderRestaurant;
  location: LatLng | null;
  /** Its open orders, most urgent first. */
  orderIds: string[];
  /** The most urgent phase among them — what the pin is coloured by. */
  phase: OrderPhase;
  /** Whether a customer can order from it right now, by the apps' own rule. Worth
   * knowing here because every restaurant on the map has an order open: one that has
   * paused or closed with it still on is the call ops most needs to make. */
  hours: RestaurantHours;
};

export type DispatchDriver = {
  key: string;
  id: string;
  row: DriverParty;
  location: LatLng | null;
  /** Epoch ms of the row's last write, or null when the row never came back whole. */
  seenAt: number | null;
  state: DriverState;
  /** No position write for longer than `DRIVER_SIGNAL_TIMEOUT_MS`. Kept separate from
   * `state` because a busy driver can lose signal too, and is still busy. */
  isStale: boolean;
  /** Open orders this driver is carrying. */
  orderIds: string[];
};

export type DispatchCounts = Record<OrderPhase, number> &
  Record<DriverState, number> & {
    /** Orders waiting on the restaurant for longer than the board's stale threshold. */
    late: number;
  };

export type DispatchModel = {
  /** Most urgent phase first; oldest first within a phase. */
  orders: DispatchOrder[];
  /** Every restaurant with an open order, most urgent first. */
  restaurants: DispatchRestaurant[];
  /** Available, then busy, then signal lost. */
  drivers: DispatchDriver[];
  ordersById: ReadonlyMap<string, DispatchOrder>;
  restaurantsById: ReadonlyMap<string, DispatchRestaurant>;
  driversById: ReadonlyMap<string, DispatchDriver>;
  counts: DispatchCounts;
};

function timeOf(iso: string | undefined): number | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : null;
}

/**
 * Builds the model from the two reads behind the map: the open orders (drivers
 * included on them) and the drivers who are online.
 *
 * A driver can arrive through either, or both. One carrying an order has usually
 * switched `driverActive` off — the driver app does that when it accepts — so the only
 * place their position comes from is the order they are carrying. Where a driver appears
 * twice, the row written most recently wins, since that is the one with the newer
 * position.
 */
export function buildDispatchModel(
  orderRows: readonly DispatchOrderRow[],
  onlineDrivers: readonly DriverParty[],
  now: number,
): DispatchModel {
  const orders: DispatchOrder[] = [];

  for (const row of orderRows) {
    const phase = phaseOf(row);
    if (!phase) continue;
    orders.push({
      key: entityKey('order', row.objectId),
      id: row.objectId,
      row,
      phase,
      placedAt: timeOf(row.createdAt) ?? now,
      pickup: toLatLng(row.restaurant?.location),
      dropoff: row.deliveryType === 'delivery' ? toLatLng(row.userAddress?.location) : null,
      restaurantId: row.restaurant?.objectId ?? null,
      driverId: row.driver?.objectId ?? null,
    });
  }

  orders.sort((a, b) => PHASE_RANK[a.phase] - PHASE_RANK[b.phase] || a.placedAt - b.placedAt);

  // Drivers: the online list first, then whoever the orders name, newest row winning.
  const driverRows = new Map<string, DriverParty>();
  for (const row of onlineDrivers) driverRows.set(row.objectId, row);
  for (const order of orders) {
    const row = order.row.driver;
    if (!row?.objectId) continue;
    const known = driverRows.get(row.objectId);
    if (!known) {
      driverRows.set(row.objectId, row);
      continue;
    }
    const isNewer = (timeOf(row.updatedAt) ?? 0) > (timeOf(known.updatedAt) ?? 0);
    // Spread the older one underneath so a field only one of the two reads selected
    // (the online list is narrowed with `select`) survives either way.
    driverRows.set(row.objectId, isNewer ? { ...known, ...row } : { ...row, ...known });
  }

  const jobsByDriver = new Map<string, string[]>();
  for (const order of orders) {
    if (!order.driverId) continue;
    const jobs = jobsByDriver.get(order.driverId);
    if (jobs) jobs.push(order.id);
    else jobsByDriver.set(order.driverId, [order.id]);
  }

  const drivers: DispatchDriver[] = [];
  for (const row of driverRows.values()) {
    const seenAt = timeOf(row.updatedAt);
    const orderIds = jobsByDriver.get(row.objectId) ?? [];

    // An account still flagged online whose app stopped reporting hours or years ago —
    // see `DRIVER_ONLINE_WINDOW_MS`. Not a driver who lost signal; a row nobody switched
    // off. Carrying an order keeps anyone in regardless.
    const isAbandoned = seenAt === null || now - seenAt > DRIVER_ONLINE_WINDOW_MS;
    if (isAbandoned && orderIds.length === 0) continue;

    const isStale = seenAt === null || now - seenAt > DRIVER_SIGNAL_TIMEOUT_MS;
    const state: DriverState = orderIds.length > 0 ? 'busy' : isStale ? 'signalLost' : 'available';
    drivers.push({
      key: entityKey('driver', row.objectId),
      id: row.objectId,
      row,
      location: toLatLng(row.driverLocation),
      seenAt,
      state,
      isStale,
      orderIds,
    });
  }

  drivers.sort(
    (a, b) =>
      DRIVER_STATE_RANK[a.state] - DRIVER_STATE_RANK[b.state] ||
      // Among the lost, whoever was heard from last is the likeliest to pick up.
      (a.state === 'signalLost' ? (b.seenAt ?? 0) - (a.seenAt ?? 0) : 0) ||
      compareNames(a.row.fullname, b.row.fullname),
  );

  // The restaurant rows come included on the orders — whole, hours and all — so they are
  // as fresh as the orders themselves.
  const clock = algiersClock(now);
  const restaurantsById = new Map<string, DispatchRestaurant>();
  for (const order of orders) {
    const row = order.row.restaurant;
    if (!row?.objectId) continue;
    const existing = restaurantsById.get(row.objectId);
    if (existing) {
      // Orders arrive most urgent first, so the first one seen already set the phase.
      existing.orderIds.push(order.id);
      continue;
    }
    restaurantsById.set(row.objectId, {
      key: entityKey('restaurant', row.objectId),
      id: row.objectId,
      row,
      location: toLatLng(row.location),
      orderIds: [order.id],
      phase: order.phase,
      hours: restaurantHours(row, clock),
    });
  }

  const counts: DispatchCounts = {
    needsDriver: 0,
    awaitingRestaurant: 0,
    withDriver: 0,
    pickup: 0,
    available: 0,
    busy: 0,
    signalLost: 0,
    late: 0,
  };
  for (const order of orders) {
    counts[order.phase] += 1;
    if (isLate(order, now)) counts.late += 1;
  }
  for (const driver of drivers) counts[driver.state] += 1;

  return {
    orders,
    restaurants: [...restaurantsById.values()],
    drivers,
    ordersById: new Map(orders.map((order) => [order.id, order])),
    restaurantsById,
    driversById: new Map(drivers.map((driver) => [driver.id, driver])),
    counts,
  };
}

/** Waiting on the restaurant for longer than the board's own threshold — the same
 * "Waiting 12 min" tag the orders board puts on the row. */
export function isLate(order: DispatchOrder, now: number): boolean {
  return order.phase === 'awaitingRestaurant' && now - order.placedAt > STALE_AFTER_MS;
}

/* ---- who can take what ------------------------------------------------------- */

/**
 * An order a driver can be put on: an open delivery nobody is carrying. Same rule as the
 * board's red "No driver" tag, and the same states switch-dashboard offers Assign Driver
 * for (src/pages/Orders/Orders.jsx `doAction`).
 */
export function isAssignable(order: DispatchOrder): boolean {
  return isUnassignedDelivery(order.row);
}

/**
 * A driver an order can be put on: online by their own switch, and carrying nothing.
 *
 * `driverActive` is the platform's own test — `assignDriver` refuses anyone with it off
 * as `DRIVER_DISCONNECTED` — so offering those drivers would only offer an error. A
 * driver whose signal is lost still passes: the flag is on and a phone call may well
 * reach them; they are ranked last and marked instead.
 */
export function canTakeOrders(driver: DispatchDriver): boolean {
  return driver.row.driverActive === true && driver.orderIds.length === 0;
}

export type Ranked<T> = { item: T; meters: number | null };

function compareMeters(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}

function compareNames(a: string | undefined, b: string | undefined): number {
  return (a ?? '').localeCompare(b ?? '');
}

/**
 * Drivers who could take an order at `target`, nearest first.
 *
 * Drivers whose position is stale sort after every fresh one however close their last
 * known position was — a ten-minute-old dot next to the restaurant is where the driver
 * *was*. Drivers with no position at all come last, by name.
 */
export function rankDrivers(
  target: LatLng | null,
  drivers: readonly DispatchDriver[],
): Ranked<DispatchDriver>[] {
  return drivers
    .filter(canTakeOrders)
    .map((item) => ({
      item,
      meters: target && item.location ? distanceMeters(target, item.location) : null,
    }))
    .sort(
      (a, b) =>
        Number(a.item.isStale) - Number(b.item.isStale) ||
        compareMeters(a.meters, b.meters) ||
        compareNames(a.item.row.fullname, b.item.row.fullname),
    );
}

/** Orders that need a driver, nearest restaurant to `from` first; oldest first on a tie. */
export function rankOrders(
  from: LatLng | null,
  orders: readonly DispatchOrder[],
): Ranked<DispatchOrder>[] {
  return orders
    .filter(isAssignable)
    .map((item) => ({
      item,
      meters: from && item.pickup ? distanceMeters(from, item.pickup) : null,
    }))
    .sort((a, b) => compareMeters(a.meters, b.meters) || a.item.placedAt - b.item.placedAt);
}

/** Where a driver on this order is heading next: the restaurant until the food is
 * collected (status 2), the customer after. */
export function nextStopOf(order: DispatchOrder): LatLng | null {
  return order.row.status === 2 ? order.dropoff : order.pickup;
}

/* ---- focus: what a selection lights up ----------------------------------------- */

/** How many ranked candidates the map draws and numbers. Three is what fits in a glance;
 * the panel lists everyone. */
export const MAP_CANDIDATES = 3;

/**
 * - `trip` — restaurant to customer: the order itself.
 * - `approach` — a driver to their next stop.
 * - `candidate` — a free driver to a restaurant they could be sent to.
 */
export type RouteKind = 'trip' | 'approach' | 'candidate';

export type RouteLeg = { kind: RouteKind; from: LatLng; to: LatLng; phase?: OrderPhase };

/**
 * Everything a selection means on the map: which pins stay bright (the rest dim), what
 * the camera frames, which lines are drawn between them, and which candidates are
 * numbered.
 */
export type Focus = {
  keys: ReadonlySet<string>;
  points: LatLng[];
  legs: RouteLeg[];
  ranks: ReadonlyMap<string, number>;
};

export function focusOn(model: DispatchModel, selection: DispatchSelection): Focus | null {
  if (selection.kind === 'order') {
    const order = model.ordersById.get(selection.id);
    return order ? orderFocus(model, order) : null;
  }
  if (selection.kind === 'driver') {
    const driver = model.driversById.get(selection.id);
    return driver ? driverFocus(model, driver) : null;
  }
  const restaurant = model.restaurantsById.get(selection.id);
  return restaurant ? restaurantFocus(model, restaurant) : null;
}

type FocusDraft = {
  keys: Set<string>;
  points: LatLng[];
  legs: RouteLeg[];
  ranks: Map<string, number>;
};

function emptyDraft(): FocusDraft {
  return { keys: new Set(), points: [], legs: [], ranks: new Map() };
}

/** Adds one order, its restaurant and its driver, with the order's own lines. */
function addOrder(model: DispatchModel, draft: FocusDraft, order: DispatchOrder) {
  draft.keys.add(order.key);
  if (order.restaurantId) draft.keys.add(entityKey('restaurant', order.restaurantId));
  if (order.pickup) draft.points.push(order.pickup);
  if (order.dropoff) draft.points.push(order.dropoff);
  if (order.pickup && order.dropoff) {
    draft.legs.push({ kind: 'trip', from: order.pickup, to: order.dropoff, phase: order.phase });
  }

  const driver = order.driverId ? model.driversById.get(order.driverId) : undefined;
  if (!driver) return;
  draft.keys.add(driver.key);
  if (!driver.location) return;
  draft.points.push(driver.location);
  const next = nextStopOf(order);
  if (next) draft.legs.push({ kind: 'approach', from: driver.location, to: next });
}

/** Numbers the nearest free drivers to `target` and draws them in. */
function addCandidates(model: DispatchModel, draft: FocusDraft, target: LatLng) {
  rankDrivers(target, model.drivers)
    .filter((entry) => entry.item.location)
    .slice(0, MAP_CANDIDATES)
    .forEach(({ item }, index) => {
      draft.keys.add(item.key);
      draft.ranks.set(item.key, index + 1);
      draft.points.push(item.location!);
      draft.legs.push({ kind: 'candidate', from: item.location!, to: target });
    });
}

function orderFocus(model: DispatchModel, order: DispatchOrder): Focus {
  const draft = emptyDraft();
  addOrder(model, draft, order);
  if (isAssignable(order) && order.pickup) addCandidates(model, draft, order.pickup);
  return draft;
}

function driverFocus(model: DispatchModel, driver: DispatchDriver): Focus {
  const draft = emptyDraft();
  draft.keys.add(driver.key);
  if (driver.location) draft.points.push(driver.location);

  for (const orderId of driver.orderIds) {
    const order = model.ordersById.get(orderId);
    if (order) addOrder(model, draft, order);
  }

  if (canTakeOrders(driver) && driver.location) {
    rankOrders(driver.location, model.orders)
      .filter((entry) => entry.item.pickup)
      .slice(0, MAP_CANDIDATES)
      .forEach(({ item }, index) => {
        draft.keys.add(item.key);
        if (item.restaurantId) {
          const key = entityKey('restaurant', item.restaurantId);
          draft.keys.add(key);
          // Two nearby orders can share a restaurant; its pin keeps the better rank.
          if (!draft.ranks.has(key)) draft.ranks.set(key, index + 1);
        }
        draft.points.push(item.pickup!);
        draft.legs.push({ kind: 'candidate', from: driver.location!, to: item.pickup! });
      });
  }

  return draft;
}

function restaurantFocus(model: DispatchModel, restaurant: DispatchRestaurant): Focus {
  const draft = emptyDraft();
  draft.keys.add(restaurant.key);
  if (restaurant.location) draft.points.push(restaurant.location);

  let needsDriver = false;
  for (const orderId of restaurant.orderIds) {
    const order = model.ordersById.get(orderId);
    if (!order) continue;
    addOrder(model, draft, order);
    if (isAssignable(order)) needsDriver = true;
  }

  if (needsDriver && restaurant.location) addCandidates(model, draft, restaurant.location);
  return draft;
}

/* ---- the panel's filter box ---------------------------------------------------- */

/**
 * Lower-cased with accents stripped, so "zeralda" finds "Zéralda" and "cafe" finds
 * "Café" — the way people type a name they heard over the phone.
 */
export function normalizeForSearch(value: string | undefined | null): string {
  return (value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();
}

/** Digits only, so "0550 12 34 56" and "0550123456" are the same number. */
function digits(value: string | undefined | null): string {
  return (value ?? '').replace(/\D+/g, '');
}

function matches(query: string, fields: (string | undefined | null)[], phones: (string | undefined | null)[]) {
  const text = normalizeForSearch(query);
  if (!text) return true;
  if (fields.some((field) => normalizeForSearch(field).includes(text))) return true;
  const number = digits(query);
  return number.length >= 3 && phones.some((phone) => digits(phone).includes(number));
}

export function orderMatches(order: DispatchOrder, query: string): boolean {
  const { row } = order;
  return matches(
    query,
    [row.objectId, row.restaurant?.name, row.user?.fullname, row.driver?.fullname],
    [row.user?.phone, row.restaurant?.phone, row.driver?.phone],
  );
}

export function driverMatches(driver: DispatchDriver, query: string): boolean {
  const { row } = driver;
  return matches(query, [row.objectId, row.fullname, row.username], [row.phone]);
}

export function restaurantMatches(restaurant: DispatchRestaurant, query: string): boolean {
  const { row } = restaurant;
  return matches(query, [row.objectId, row.name, row.address], [row.phone]);
}
