import type { MessageKey } from '@/lib/i18n/dictionary';
import type { DeliveryType, Order } from '@/types/order';

/**
 * An order's state is two fields, not one.
 *
 * `status` runs 0→3, but `canceled` is a **separate boolean that overrides it** — a
 * canceled order keeps whatever status it had reached, so reading `status` alone will
 * happily report a refunded order as "on the way". On top of that, the labels for
 * statuses 2 and 3 depend on `deliveryType`: 2 is "on the way" for a delivery and
 * "ready for pickup" for a collection.
 *
 * Both quirks are the backend's (switch-dashboard/src/configs/index.js:65-78, mirrored
 * in switch-driver's own configs) and are resolved here, once, so that no screen has to
 * remember that "3" means two different words.
 */

/**
 * The coarse bucket ops thinks in. Five stages rather than the four statuses plus a
 * flag, because "canceled" is a state a dispatcher scans for and "delivered vs picked
 * up" is not — that distinction belongs on the row, not in the pipeline.
 */
export const ORDER_STAGES = ['new', 'confirmed', 'active', 'done', 'canceled'] as const;

export type OrderStage = (typeof ORDER_STAGES)[number];

/**
 * The palette token each stage paints with, chosen to match switch-dashboard's own
 * status colours (`#f2bc57` amber → warning, `#6bc426` green → success, `#228ff2` blue
 * → accent, `#919191` grey → default) rather than switch-driver's, which colour both
 * "confirmed" and "delivered" green. On a board whose whole purpose is spotting work
 * that has stalled, finished work has to recede, not compete.
 */
export const STAGE_TOKEN: Record<OrderStage, 'warning' | 'success' | 'accent' | 'default' | 'danger'> =
  {
    new: 'warning',
    confirmed: 'success',
    active: 'accent',
    done: 'default',
    canceled: 'danger',
  };

/** The CSS custom property behind each stage, for the places a class name can't reach —
 * the pipeline bar's inline widths, the row's status rail. */
export const STAGE_COLOR_VAR: Record<OrderStage, string> = {
  new: 'var(--warning)',
  confirmed: 'var(--success)',
  active: 'var(--accent)',
  done: 'var(--faint)',
  canceled: 'var(--danger)',
};

export const STAGE_LABEL_KEY: Record<OrderStage, MessageKey> = {
  new: 'orders.stage.new',
  confirmed: 'orders.stage.confirmed',
  active: 'orders.stage.active',
  done: 'orders.stage.done',
  canceled: 'orders.stage.canceled',
};

/** The `status` value each non-canceled stage corresponds to, for building queries. */
export const STAGE_STATUS: Record<Exclude<OrderStage, 'canceled'>, number> = {
  new: 0,
  confirmed: 1,
  active: 2,
  done: 3,
};

type StateFields = Pick<Order, 'status' | 'canceled'>;

/** The stage an order is in, or null when `status` is a value this app doesn't know. */
export function stageOf(order: StateFields): OrderStage | null {
  if (order.canceled) return 'canceled';
  switch (order.status) {
    case 0:
      return 'new';
    case 1:
      return 'confirmed';
    case 2:
      return 'active';
    case 3:
      return 'done';
    default:
      return null;
  }
}

const DELIVERY_STATUS_KEYS: MessageKey[] = [
  'orders.status.placed',
  'orders.status.confirmed',
  'orders.status.onTheWay',
  'orders.status.delivered',
];

const PICKUP_STATUS_KEYS: MessageKey[] = [
  'orders.status.placed',
  'orders.status.confirmed',
  'orders.status.prepared',
  'orders.status.picked',
];

/**
 * The precise label for a row: 'Ready for pickup' rather than the stage's 'In transit'.
 * Canceled wins over everything, per the note at the top of this file.
 */
export function statusLabelKey(
  order: StateFields & { deliveryType?: DeliveryType },
): MessageKey {
  if (order.canceled) return 'orders.status.canceled';
  const keys = order.deliveryType === 'pickup' ? PICKUP_STATUS_KEYS : DELIVERY_STATUS_KEYS;
  const index = order.status;
  if (index === undefined || index < 0 || index >= keys.length) return 'orders.status.unknown';
  return keys[index];
}

/**
 * How long a still-unconfirmed order has to sit before the console starts complaining
 * about it — on the board's row and on the live map alike. Ten minutes is roughly when a
 * customer starts wondering, which is the moment before ops would rather hear about it
 * than hear from them.
 */
export const STALE_AFTER_MS = 10 * 60 * 1000;

/**
 * Whether this order is one ops still has to do something about — used to decide
 * whether the row shows how long it has been waiting. A finished or canceled order has
 * no clock running on it.
 */
export function isOpen(order: StateFields): boolean {
  const stage = stageOf(order);
  return stage === 'new' || stage === 'confirmed' || stage === 'active';
}

/**
 * A delivery that nobody is carrying. The single most actionable thing on the board, so
 * it gets a name rather than being re-derived at each of the three places it is used.
 *
 * Pickups are excluded by definition: the customer is the courier. `status >= 3` is
 * excluded because an order already delivered plainly found a driver, whatever the
 * pointer says — historic rows exist with the driver never written back.
 */
export function isUnassignedDelivery(
  order: StateFields & { deliveryType?: DeliveryType; driver?: unknown },
): boolean {
  if (order.canceled) return false;
  if (order.deliveryType !== 'delivery') return false;
  if ((order.status ?? 0) >= 3) return false;
  return !order.driver;
}
