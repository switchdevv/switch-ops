import type { Order } from './order';
import type { ParseDateJSON, ParseObjectJSON, ParsePointer } from './parse';
import type { DriverParty } from './user';

/**
 * The `DispatchQueue` class — one order lined up behind one driver.
 *
 * This console's own class, not the platform's: nothing else reads or writes it, and no
 * cloud trigger sits behind it. It exists because a driver can carry only one order at a
 * time — the driver app keeps a single current order and `assignDriver` refuses a driver
 * who is on a job — so "give Karim the Pizza Roma order next" has to be *held* somewhere
 * until Karim is free, and then sent. See lib/ops/queue.ts for every rule about it.
 *
 * Rows are never deleted. Each one ends in `accepted`, `dispatched`, `removed` or
 * `dropped`, which makes the class the record of who queued what and when it went out.
 */

/**
 * - `queued` — waiting its turn.
 * - `dispatching` — a console has claimed it and is calling `assignDriver` right now. A
 *   claim nobody finished recording counts as sent (see `sentAtOf` in lib/ops/queue.ts).
 * - `dispatched` — sent to the driver, not taken yet. Kept visible for a while, because a
 *   sent order the driver has not accepted yet still holds the rest of their line (see
 *   `OFFER_GRACE_MS`).
 * - `accepted` — the driver took it. Closed for good: if they cancel afterwards, the order
 *   goes back to needing a driver, never back into a line. Only ops queue an order.
 * - `removed` — taken out of the line by ops.
 * - `dropped` — taken out by the console, because the order no longer needed it.
 */
export type QueueState = 'queued' | 'dispatching' | 'dispatched' | 'accepted' | 'removed' | 'dropped';

/** Why the console dropped a row — written to the row, so the audit trail says it. */
export type DropReason =
  | 'canceled'
  | 'delivered'
  | 'assignedElsewhere'
  /** Ops took the driver off the order: it needs a driver again, not a line. */
  | 'unassigned'
  | 'duplicate'
  | 'notDelivery'
  | 'missing';

/**
 * A queue row as read, with `order` and `driver` included.
 *
 * The included order is one level deep, so its own pointers (`driver`, `city`) are stubs —
 * which is all the queue needs of them: *whether* the order has a driver, and whose.
 */
export type QueueEntry = ParseObjectJSON & {
  order?: Order;
  driver?: DriverParty;
  city?: ParsePointer<'City'>;
  /** The ops account that put it in the line. */
  queuedBy?: ParsePointer<'_User'>;
  /** Position key within the driver's line: lower goes first. */
  rank?: number;
  state?: QueueState;
  dropReason?: DropReason;
  /** A counter consoles increment to claim the row before dispatching it — see
   * `claimEntry` in lib/services/queue.ts. */
  claim?: number;
  claimedAt?: ParseDateJSON;
  dispatchedAt?: ParseDateJSON;
  /**
   * The refusal message of the last failed `assignDriver`, e.g. `DRIVER_DISCONNECTED`.
   *
   * Also `DRIVER_REFUSED`, which is not a refusal by the platform but by the driver: the
   * driver app writes it alongside `state: 'removed'` when they hand a queued order back
   * (switch-driver/src/api/modules/queue.js). It is the only value written from outside
   * this console, and the only way to tell a driver's removal from an operator's.
   */
  lastError?: string;
  lastAttemptAt?: ParseDateJSON;
};
