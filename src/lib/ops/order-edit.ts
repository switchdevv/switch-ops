import type { Order, OrderOptions } from '@/types/order';
import { isUnassignedDelivery } from './order-status';

/**
 * What ops can do to an order from its detail: confirm it on the restaurant's behalf,
 * correct its status or its prices, and take its driver off it.
 *
 * Confirm and Edit are transcribed from switch-dashboard's Orders page
 * (src/pages/Orders/Orders.jsx): Confirm is its `acceptManager` action, Edit its edit
 * dialog (`itemEdit`). Unassign has no dashboard counterpart — see `canUnassignDriver`.
 * The rules live here, free of React and Parse, so the board and the live map offer the
 * same thing.
 */

type OrderFields = Pick<Order, 'status' | 'canceled' | 'deliveryType' | 'options'>;

/**
 * Placed and not yet accepted — the only state `acceptManager` takes. It refuses a
 * canceled order (`ORDER_CANCELED`) and anything past status 0 (`ORDER_FULLFILLED`).
 */
export function canConfirm(order: Pick<Order, 'status' | 'canceled'>): boolean {
  return !order.canceled && order.status === 0;
}

/**
 * Whether confirming this order may also send it a driver — switch-dashboard's "Don't
 * choose a driver" question, answered by ops picking one rather than by `chooseDriver`.
 *
 * Only a delivery nobody is carrying. Never a pickup: the customer is the courier, and
 * `assignDriver` on the server doesn't refuse one, so the rule has to hold here.
 */
export function canSendDriverOnConfirm(
  order: Pick<Order, 'status' | 'canceled' | 'deliveryType'> & { driver?: unknown },
): boolean {
  return isUnassignedDelivery(order);
}

/**
 * Whether ops can take the driver off this order, handing it back to "needs a driver".
 *
 * Only a delivery a driver has accepted and not delivered yet. An offer the driver hasn't
 * accepted can't be told apart on the row (`assignDriver` leaves `driver` empty until
 * `acceptDriver`), so there is nothing here to take off; a delivered order is history.
 */
export function canUnassignDriver(
  order: Pick<Order, 'status' | 'canceled' | 'deliveryType'> & { driver?: { objectId?: string } | null },
): boolean {
  if (order.canceled) return false;
  if (order.deliveryType !== 'delivery') return false;
  if ((order.status ?? 0) >= 3) return false;
  return Boolean(order.driver?.objectId);
}

/**
 * Whether ops can cancel this order through `cancelManager`, as switch-dashboard does.
 *
 * Not once the food has left the restaurant: the server refuses any status above 1 with
 * `ORDER_FULLFILLED` (switch-server cloud/order/manager.js), whatever the dashboard's own
 * button lets through. A canceled order isn't refused there, but a second cancel would
 * push the customer and the driver all over again.
 */
export function canCancelOrder(order: Pick<Order, 'status' | 'canceled'>): boolean {
  return !order.canceled && (order.status ?? 0) <= 1;
}

/** The longest reason ops can give — it is the body of a push notification. */
export const CANCEL_REASON_MAX = 200;

/** Every status the edit offers — all four, for either fulfilment type, as on the
 * dashboard. Their labels depend on `deliveryType`; see `statusLabelKey`. */
export const ORDER_STATUSES = [0, 1, 2, 3] as const;

/** The money on an order that ops can correct. Amounts are whole units, as the
 * dashboard's `parseInt` saves them. */
export type MoneyField = 'itemsTotal' | 'discount' | 'delivery' | 'service' | 'total';

/** Pickups have no delivery fee, so no delivery field. */
export function moneyFieldsFor(isDelivery: boolean): MoneyField[] {
  return isDelivery
    ? ['itemsTotal', 'discount', 'delivery', 'service', 'total']
    : ['itemsTotal', 'discount', 'service', 'total'];
}

/** The edit form's state. Amounts stay text while typed, so an emptied field is not
 * silently a zero. */
export type OrderEditDraft = {
  status: number;
  canceled: boolean;
  freeDelivery: boolean;
} & Record<MoneyField, string>;

function amountText(value: number | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

export function draftFrom(order: OrderFields): OrderEditDraft {
  const options = order.options;
  return {
    status: order.status ?? 0,
    canceled: order.canceled === true,
    freeDelivery: options?.freeDelivery === true,
    itemsTotal: amountText(options?.itemsTotal),
    discount: amountText(options?.discount),
    delivery: amountText(options?.delivery),
    service: amountText(options?.service),
    total: amountText(options?.total),
  };
}

/** A whole amount, 0 or more, or null when the text isn't one. */
export function parseAmount(text: string): number | null {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/**
 * What the total should be, from the other amounts — the customer app's own formula
 * (switch-food/src/screens/Cart/Checkout.js):
 *
 *   total = itemsTotal − discount + service + delivery
 *
 * where a free-delivery order keeps its `delivery` fee on the row but doesn't charge it.
 * Null while any of those amounts isn't a valid number yet.
 */
export function sumOf(draft: OrderEditDraft, isDelivery: boolean): number | null {
  const itemsTotal = parseAmount(draft.itemsTotal);
  const discount = parseAmount(draft.discount);
  const service = parseAmount(draft.service);
  const delivery = isDelivery ? parseAmount(draft.delivery) : 0;
  if (itemsTotal === null || discount === null || service === null || delivery === null) return null;
  return itemsTotal - discount + service + (isDelivery && !draft.freeDelivery ? delivery : 0);
}

/** The `editOrder` cloud function's parameters. `options` is merged into the row's own
 * server-side, so the basket, the note and the payment method are left as they are. */
export type EditOrderParams = {
  id: string;
  options: Partial<OrderOptions>;
  status?: number;
  canceled?: boolean;
};

export type OrderEditResult =
  | { ok: true; params: EditOrderParams }
  | { ok: false; field: MoneyField };

/**
 * The edit as `editOrder` takes it, or the first amount that isn't valid.
 *
 * Every amount is sent, as the dashboard sends them; status and canceled only when they
 * changed, so saving a price correction can't reset a status the order moved to while
 * the form was open.
 */
export function buildOrderEdit(
  orderId: string,
  order: OrderFields,
  draft: OrderEditDraft,
): OrderEditResult {
  const isDelivery = order.deliveryType === 'delivery';
  const amounts: Partial<Record<MoneyField, number>> = {};
  for (const field of moneyFieldsFor(isDelivery)) {
    const amount = parseAmount(draft[field]);
    if (amount === null) return { ok: false, field };
    amounts[field] = amount;
  }

  const options: Partial<OrderOptions> = {
    itemsTotal: amounts.itemsTotal,
    discount: amounts.discount,
    service: amounts.service,
    total: amounts.total,
  };
  if (isDelivery) {
    options.delivery = amounts.delivery;
    options.freeDelivery = draft.freeDelivery;
  }

  const params: EditOrderParams = { id: orderId, options };
  if (draft.status !== (order.status ?? 0)) params.status = draft.status;
  if (draft.canceled !== (order.canceled === true)) params.canceled = draft.canceled;
  return { ok: true, params };
}
