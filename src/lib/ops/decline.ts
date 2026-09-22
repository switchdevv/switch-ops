import type { DriverDecline, Order } from '@/types/order';

/**
 * Reading `Order.driverDeclines`. The column is plain JSON that the Parse Dashboard can
 * edit, so nothing about its shape is taken on trust: a malformed entry is skipped.
 */

/** One driver's decline of the order, or null. */
export function declineOf(order: Pick<Order, 'driverDeclines'> | undefined, driverId: string): DriverDecline | null {
  const value = order?.driverDeclines?.[driverId];
  if (!value || typeof value.at !== 'string' || !Number.isFinite(Date.parse(value.at))) return null;
  return {
    driverId,
    driverName: typeof value.name === 'string' ? value.name : null,
    declinedAt: value.at,
  };
}

/** Every decline of the order, newest first. */
export function declinesOf(order: Pick<Order, 'driverDeclines'> | undefined): DriverDecline[] {
  const map = order?.driverDeclines;
  if (!map || typeof map !== 'object') return [];
  return Object.keys(map)
    .map((driverId) => declineOf(order, driverId))
    .filter((decline): decline is DriverDecline => decline !== null)
    .sort((a, b) => Date.parse(b.declinedAt) - Date.parse(a.declinedAt));
}
