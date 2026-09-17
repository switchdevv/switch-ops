import type { EditOrderParams } from '@/lib/ops/order-edit';
import { runFunction } from '@/lib/parse/cloud';
import { DRIVER_CHANGED, ORDER_DELIVERED } from '@/lib/parse/errors';
import { updateObject } from '@/lib/parse/objects';
import { findOne } from '@/lib/parse/query';
import { notifyDriverUnassigned } from '@/lib/services/notify';
import { settleQueueAfterCancel, settleQueueAfterUnassign } from '@/lib/services/queue';
import type { Order } from '@/types/order';

const ORDER = 'Order';

/**
 * Accepts a placed order on the restaurant's behalf — the manager app's Accept, through
 * the same `acceptManager` cloud function. It sets status 1, counts the acceptance on the
 * restaurant, and notifies the customer.
 *
 * `noChoose: true` is not optional. Without it the function starts `chooseDriver` for a
 * delivery — the automatic driver search this team doesn't use (see AGENTS.md, "Dispatch
 * is manual"). switch-dashboard offers the same switch as a checkbox; here it is always
 * on, and ops pick the driver themselves in the confirm step (see
 * components/orders/confirm-order-step.tsx), which sends `assignDriver` right after.
 */
export async function confirmOrder(orderId: string): Promise<void> {
  await runFunction('acceptManager', { objectId: orderId, noChoose: true });
}

/**
 * Corrects an order's status, canceled flag and prices through `editOrder`, as
 * switch-dashboard's edit dialog does. A plain write: it notifies nobody.
 */
export async function editOrder(params: EditOrderParams): Promise<void> {
  await runFunction('editOrder', params);
}

/**
 * Cancels an order with a reason, through the same `cancelManager` call as
 * switch-dashboard's Cancel Order dialog (`fromAdmin: true`, so the staff "canceled by the
 * restaurant" push isn't sent back to ops).
 *
 * The server sets `canceled` and, unless `notify` is false, pushes the customer's app and
 * — when a driver has accepted it — the driver's, both with the reason as the body and the
 * platform's cancel payload, so the driver app drops the order and goes back online. Its
 * title is the server's own copy, "Order #… was canceled by <restaurant>", whoever
 * cancelled. It refuses an order past status 1 with `ORDER_FULLFILLED`.
 *
 * The row is re-read first: the server doesn't refuse an order that is already canceled,
 * and a second cancel from a panel a refresh behind would notify everyone twice.
 */
export async function cancelOrder(orderId: string, reason: string, notify: boolean): Promise<void> {
  const row = await findOne<Pick<Order, 'objectId' | 'status' | 'canceled'>>(ORDER, [
    { equalTo: { key: 'objectId', value: orderId } },
    { select: ['status', 'canceled'] },
  ]);
  if (!row || row.canceled) throw new Error('ORDER_CANCELED');
  if ((row.status ?? 0) > 1) throw new Error('ORDER_FULLFILLED');

  await runFunction('cancelManager', { objectId: orderId, reason, noNotifs: !notify, fromAdmin: true });

  // The runner would drop the order's queue rows on its next look anyway; doing it now
  // stops a send in the meantime. Never a reason to report the cancel as failed.
  await settleQueueAfterCancel(orderId).catch((error: unknown) => {
    if (process.env.NODE_ENV !== 'production') console.error('[queue] after cancel', error);
  });
}

export type UnassignResult = {
  /** Whether the driver's app was sent the push that makes it let go of the order. */
  isDriverNotified: boolean;
};

/**
 * Takes a driver off an order they accepted, so it needs a driver again.
 *
 * One of the two order changes this console makes with a plain save (the other is ops' call
 * marks, lib/services/order-calls.ts), because no cloud function does only this. `cancelDriver` — the driver app's own cancel — clears the field, but then
 * either starts `chooseDriver` (called without a reason) or pushes every staff account
 * "canceled by the driver" (with one), and neither is true of ops' decision. So the three
 * parts `cancelDriver` would do are done here instead: the row gets `driver: null`, the
 * very write that function makes; the queue lets go of the order; and the driver is told
 * through the staff-gated `sendPush`, in the platform's own cancel payload. The `Order`
 * class grants update to `role:Staff`, and orders are created by master key with no ACL.
 *
 * Nothing about the status changes, and the customer isn't notified — a new driver is
 * ops' next step, not the customer's news.
 *
 * `driverId` is the driver ops saw on the order. The row is re-read first and the write
 * refused unless it still carries that driver: Parse has no conditional update, but a
 * panel a refresh behind — the driver cancelled and a new one accepted — must not take
 * the *new* driver off.
 */
export async function unassignDriver(orderId: string, driverId: string): Promise<UnassignResult> {
  const row = await findOne<Pick<Order, 'objectId' | 'driver' | 'status' | 'canceled'>>(ORDER, [
    { equalTo: { key: 'objectId', value: orderId } },
    { select: ['driver', 'status', 'canceled'] },
  ]);
  // Canceled and delivered checked before the driver: a finished order keeps its driver,
  // and "someone else has it now" would be the wrong thing to tell ops about it.
  if (!row || row.canceled) throw new Error('ORDER_CANCELED');
  if ((row.status ?? 0) >= 3) throw new Error(ORDER_DELIVERED);
  if (row.driver?.objectId !== driverId) throw new Error(DRIVER_CHANGED);

  await updateObject(ORDER, orderId, { driver: null });

  // After the write, never instead of it: the order is off the driver either way, and a
  // queue that couldn't be updated is no reason to report a failed unassign.
  await settleQueueAfterUnassign(orderId).catch((error: unknown) => {
    if (process.env.NODE_ENV !== 'production') console.error('[queue] after unassign', error);
  });

  return { isDriverNotified: await notifyDriverUnassigned(driverId, orderId) };
}
