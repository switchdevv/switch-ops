import type { CurrencyCode } from '@/types/city';
import type { OrderRow } from '@/types/order';

/**
 * What a driver and Switch owe each other for a set of deliveries.
 *
 * Transcribed from switch-dashboard, not invented: the Orders page, searched by driver,
 * prints this per order (src/pages/Orders/Orders.jsx:371-376) —
 *
 *   paid in cash:  freeDelivery ? service − delivery : service
 *   otherwise:     −delivery
 *
 * — for every order that isn't canceled and has reached `FINISHED_ORDER_STATUS`, which that
 * file defines as **2** (line 16): collected from the restaurant, not only delivered. A
 * driver on the way with the bag has the cash in hand as soon as they hand it over, and the
 * dashboard already counts it; this console counts the same orders so the two staff tools
 * agree on a driver's balance.
 *
 * The reasoning behind the formula, for whoever changes it: on a cash order the driver
 * collects the whole total, keeps the delivery fee as their pay, hands the food total to
 * the restaurant — and still holds the platform's service fee, which they owe Switch. A
 * free delivery was never charged to the customer, so Switch owes the driver that fee back
 * out of what they hold. On a card order the driver collects nothing and Switch owes them
 * the delivery fee. See the money model in switch-finance.
 *
 * **Sign convention:** positive means the driver owes Switch; negative means Switch owes
 * the driver.
 */

/** switch-dashboard src/pages/Orders/Orders.jsx:16 `FINISHED_ORDER_STATUS`. */
export const SETTLED_FROM_STATUS = 2;

/** The order is part of the driver's balance. */
export function isSettled(order: Pick<OrderRow, 'canceled' | 'status'>): boolean {
  return !order.canceled && (order.status ?? 0) >= SETTLED_FROM_STATUS;
}

/**
 * One order's contribution to the balance, or null when it doesn't count.
 *
 * Anything that isn't `'cash'` is treated as card, exactly as the dashboard does — an order
 * with no payment method recorded is not one the driver collected money for. A missing
 * amount counts as 0 rather than the `NaN` the dashboard would print.
 */
export function driverBalanceOf(order: Pick<OrderRow, 'canceled' | 'status' | 'options'>): number | null {
  if (!isSettled(order)) return null;
  const options = order.options ?? {};
  const service = amount(options.service);
  const delivery = amount(options.delivery);
  if (options.paymentMethod === 'cash') return options.freeDelivery ? service - delivery : service;
  return -delivery;
}

function amount(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export type DeliverySummary = {
  /** Every order the driver was on in the period, whatever became of it. */
  total: number;
  /** Delivered to the customer (status 3), not canceled. */
  delivered: number;
  canceled: number;
  /** Not canceled, not delivered yet — still on the road, or waiting to be collected. */
  open: number;
  /** Counted in the balance — see `isSettled`. */
  settled: number;
  /** Of those, paid in cash, and paid any other way. */
  cash: number;
  card: number;
  /** The delivery fees on the settled orders: what the driver earned from them. */
  deliveryFees: number;
  /** The balance. Positive: the driver owes Switch. Negative: Switch owes the driver. */
  net: number;
  /** The first currency found on an order's city, for formatting the money. */
  currency: CurrencyCode | undefined;
};

export function summarizeDeliveries(orders: readonly OrderRow[]): DeliverySummary {
  const summary: DeliverySummary = {
    total: orders.length,
    delivered: 0,
    canceled: 0,
    open: 0,
    settled: 0,
    cash: 0,
    card: 0,
    deliveryFees: 0,
    net: 0,
    currency: undefined,
  };

  for (const order of orders) {
    summary.currency ??= order.city?.currency;

    if (order.canceled) summary.canceled += 1;
    else if ((order.status ?? 0) >= 3) summary.delivered += 1;
    else summary.open += 1;

    const balance = driverBalanceOf(order);
    if (balance === null) continue;
    summary.settled += 1;
    if (order.options?.paymentMethod === 'cash') summary.cash += 1;
    else summary.card += 1;
    summary.deliveryFees += amount(order.options?.delivery);
    summary.net += balance;
  }

  return summary;
}
