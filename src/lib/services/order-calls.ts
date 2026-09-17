import { addCallMark, CALL_COLUMN, undoCallMark, type CallStep, type CallWrite } from '@/lib/ops/order-calls';
import { CALL_CHANGED } from '@/lib/parse/errors';
import { deleteField, updateObject } from '@/lib/parse/objects';
import { findOne } from '@/lib/parse/query';
import type { CallOutcome, Order } from '@/types/order';

const ORDER = 'Order';

/** Who is marking the call, as the mark records them. */
export type CallAuthor = { id: string; name: string };

/**
 * Ops' call marks, written onto the order itself (rules in lib/ops/order-calls.ts).
 *
 * A plain save, like unassigning a driver: no cloud function writes these columns, and the
 * `Order` class grants update to `role:Staff`. Nothing listens — `Order` has no triggers on
 * the server and no app writes it — so a mark notifies nobody. The columns must exist
 * first; see docs/order-calls-backend.md.
 *
 * Each write re-reads the column and decides against that, never against the list the
 * button sat in: two agents work the same orders, and a mark made a second ago on another
 * console must neither be lost nor be taken back by an Undo meant for an older one.
 */

async function readColumn(orderId: string, step: CallStep): Promise<unknown> {
  const column = CALL_COLUMN[step];
  const row = await findOne<Pick<Order, 'objectId' | 'canceled' | typeof column>>(ORDER, [
    { equalTo: { key: 'objectId', value: orderId } },
    { select: [column, 'canceled'] },
  ]);
  // A canceled order's calls are history. Gone and canceled answer the same, as when
  // unassigning a driver.
  if (!row || row.canceled) throw new Error('ORDER_CANCELED');
  return row[column];
}

async function apply(orderId: string, step: CallStep, write: CallWrite): Promise<void> {
  const column = CALL_COLUMN[step];
  switch (write.kind) {
    case 'unchanged':
      return;
    case 'stale':
      throw new Error(CALL_CHANGED);
    case 'clear':
      // Deleted rather than nulled: a null key is still present, and "not called yet" is
      // queried as the key being absent or not done.
      await updateObject(ORDER, orderId, { [column]: deleteField() });
      return;
    case 'save':
      await updateObject(ORDER, orderId, { [column]: write.value });
      return;
  }
}

/** Marks a call answered (`done`) or unanswered, as the signed-in agent, now. */
export async function recordCall(
  orderId: string,
  step: CallStep,
  outcome: CallOutcome,
  author: CallAuthor,
): Promise<void> {
  const current = await readColumn(orderId, step);
  const entry = { outcome, at: new Date().toISOString(), by: author.id, byName: author.name };
  await apply(orderId, step, addCallMark(current, entry));
}

/** Takes back a call's last mark — the one marked at `expectedAt`, which is the one ops saw. */
export async function undoCall(orderId: string, step: CallStep, expectedAt: string): Promise<void> {
  const current = await readColumn(orderId, step);
  await apply(orderId, step, undoCallMark(current, expectedAt));
}
