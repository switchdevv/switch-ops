import { DRIVER_ONLINE_WINDOW_MS } from '@/lib/ops/dispatch';
import { runFunction } from '@/lib/parse/cloud';
import { find, findWithCount, pointer, type PageResult, type QueryParam } from '@/lib/parse/query';
import type { DispatchOrderRow } from '@/types/order';
import type { DriverParty } from '@/types/user';

const ORDER = 'Order';
const USER = '_User';

/**
 * How far back the live map looks for open orders.
 *
 * "Open" alone is not enough: the table holds historic rows that never reached status 3
 * (the board's own note on `isUnassignedDelivery` mentions them), and without a window
 * every one of them would sit on the map forever as a red pin nobody can clear. Twelve
 * hours covers the longest real service — a late-night order still open at breakfast is
 * one ops needs to see — while a rolling window, unlike "today", doesn't empty the map at
 * midnight in the middle of the last rush.
 */
export const ONGOING_WINDOW_HOURS = 12;

/**
 * A ceiling, not a page size — the map shows every open order at once. Five hundred open
 * orders in twelve hours is several times the platform's real load; past it, the newest
 * are kept and the panel says how many were left out.
 */
export const ONGOING_LIMIT = 500;

/**
 * What the map renders from each order. `userAddress` and `driver` are the two it can't
 * do without — the customer's pin and the driver's position both live on those rows —
 * while `food` and `promo` feed the basket and payment the panel lists, the same as the
 * board's. No `select` alongside, for the reason given in lib/services/orders.ts.
 */
const ORDER_INCLUDES: QueryParam[] = [
  { include: 'user' },
  { include: 'driver' },
  { include: 'restaurant' },
  { include: 'city' },
  { include: 'userAddress' },
  { include: 'food' },
  { include: 'promo' },
];

export type OngoingOrders = PageResult<DispatchOrderRow>;

/**
 * Every open order placed in the last `ONGOING_WINDOW_HOURS`, in one region or all.
 *
 * The same "still open" constraints as the board's needs-a-driver count — not canceled,
 * not yet delivered — without the driver one: a map of dispatch needs the orders that
 * have a driver too, to show where those drivers are.
 */
export function listOngoingOrders(region: string): Promise<OngoingOrders> {
  // Computed per call rather than passed in: the window slides with every refresh, and
  // putting its edge in the query key would make each tick a brand-new cache entry.
  const since = new Date(Date.now() - ONGOING_WINDOW_HOURS * 60 * 60 * 1000);

  return findWithCount<DispatchOrderRow>(ORDER, [
    { equalTo: { key: 'canceled', value: false } },
    { lessThan: { key: 'status', value: 3 } },
    { greaterThanOrEqualTo: { key: 'createdAt', value: since } },
    region ? { equalTo: { key: 'city', value: pointer('City', region) } } : {},
    ...ORDER_INCLUDES,
    { descending: 'createdAt' },
    { limit: ONGOING_LIMIT },
  ]);
}

/** The columns the map reads off a driver's row. Narrowed because this is `_User`: no
 * reason for an ops console to pull push tokens, carts or auth data for every driver. */
const DRIVER_FIELDS = ['fullname', 'username', 'phone', 'driverLocation', 'driverActive', 'city'];

/**
 * Every driver who is online, in one region or all.
 *
 * Filtered on `driverActive` alone, deliberately not on `appType` containing 'driver':
 * only the driver app ever switches `driverActive` on, so it already implies the role,
 * and a driver account provisioned without the tag would otherwise vanish from the map —
 * the wrong failure for a screen whose job is to find someone to send.
 *
 * The second constraint is the one that makes the flag usable. `driverActive` is only
 * ever switched off by the app itself, so an account whose app was uninstalled or died
 * keeps it `true` indefinitely: without a floor on `updatedAt` this query returns drivers
 * last heard from years ago, and the board fills with people who are not there. The
 * driver app rewrites the row at least once a minute while online, so anyone genuinely
 * working is well inside the window.
 *
 * Drivers carrying an order usually have the switch off (the driver app flips it when it
 * accepts), so they are not in this list; the orders they carry bring them in instead.
 * See `buildDispatchModel`.
 */
export function listOnlineDrivers(region: string): Promise<DriverParty[]> {
  const since = new Date(Date.now() - DRIVER_ONLINE_WINDOW_MS);

  return find<DriverParty>(USER, [
    { equalTo: { key: 'driverActive', value: true } },
    { greaterThan: { key: 'updatedAt', value: since } },
    region ? { equalTo: { key: 'city', value: pointer('City', region) } } : {},
    { select: DRIVER_FIELDS },
    { limit: 1000 },
  ]);
}

/**
 * Puts a driver on an order — the whole of dispatch on this platform, which is manual:
 * nothing assigns a driver on its own, ops does it here or on switch-dashboard.
 *
 * The `assignDriver` cloud function, with exactly the parameters switch-dashboard sends
 * (src/pages/Orders/Orders.jsx `itemAction`). It refuses by message rather than code —
 * `DRIVER_DISCONNECTED`, `ORDER_CANCELED`, `ORDER_FULLFILLED` — which
 * `parseErrorKey(error, 'dispatch')` turns into words.
 */
export async function assignDriver(orderId: string, driverId: string): Promise<void> {
  await runFunction('assignDriver', { orderId, driverId });
}
