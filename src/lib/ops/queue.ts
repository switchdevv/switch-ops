import type { ParseDateJSON } from '@/types/parse';
import type { DropReason, QueueEntry, QueueState } from '@/types/queue';
import type { DriverParty } from '@/types/user';

/**
 * The driver queue's rules: which rows still count, who is next, and when "next" may go.
 *
 * Deliberately free of React and Parse, like lib/ops/dispatch.ts. The runner that sends
 * orders and the screens that show the line both decide from these functions, so the map
 * cannot say an order is next while the runner thinks otherwise.
 *
 * Why a queue at all: a driver carries one order at a time. The driver app keeps a single
 * current order and won't act on another until it is finished (switch-driver
 * src/screens/Home/Order.js, `workingError`). It also switches `driverActive` off when the
 * driver accepts, and `assignDriver` refuses such a driver as `DRIVER_DISCONNECTED`. So the
 * next order can't be sent early. It waits here until the driver is free, then goes.
 *
 * "Free" takes two signals, not one: the current order reaches status 3 (`finishDriver`),
 * and the app switches `driverActive` back on as it clears the finished card (Home.js
 * `hideOrder`). The second follows the first by a moment, which is what the retry covers.
 *
 * Dispatch stays manual: ops choose the driver for every queued order. The only thing
 * automated is *when* `assignDriver` is called. Nothing here searches for a driver.
 *
 * And only ops put an order in a line. A row is sent at most once: after that it can only
 * end, never go back to waiting. Once the driver has taken the order its row is closed
 * for good, so a driver who cancels hands the order back to ops as "needs a driver" — not
 * to their own line, and not to anyone else's.
 */

/** How often the runner looks. The promise is "as soon as they deliver", and one look is
 * two small reads. */
export const QUEUE_TICK_MS = 5_000;

/**
 * How long one look may take before the runner gives up on it and starts another.
 *
 * A look is a handful of requests, each a second or two. Parse's requests have no timeout,
 * though, so one that never answers (a connection that died while the laptop slept, say)
 * would hold the runner forever, and every queued order with it. A look abandoned this way
 * starts nothing new; see `runQueueTick`.
 */
export const TICK_TIMEOUT_MS = 20_000;

/**
 * How long the queue can go without a finished look before the screen says it has
 * stalled, and before another tab of the browser takes the runner over.
 *
 * Longer than `TICK_TIMEOUT_MS`, so a look that had to be abandoned is not mistaken for a
 * runner that stopped.
 */
export const RUNNER_STALL_MS = 30_000;

/** How long a claim holds before another console may take the row over. `assignDriver`
 * answers in a second or two, so a claim this old belongs to a tab that closed mid-call. */
export const CLAIM_TIMEOUT_MS = 30_000;

/**
 * How long a sent order holds the rest of the driver's line while nobody has picked it up.
 *
 * `assignDriver` notifies the driver, who still has to slide Accept. Until the order
 * shows that driver, nothing proves they took it, and sending the next one on top would
 * put two offers on a phone that can only take one. Ten minutes is how long the driver
 * app keeps a new-order push before discarding it (switch-driver/src/push/index.js). After
 * that the offer is gone and the order is back to needing a driver.
 */
export const OFFER_GRACE_MS = 10 * 60 * 1000;

/** The backend's refusal for a driver whose app isn't online. */
export const DRIVER_OFFLINE = 'DRIVER_DISCONNECTED';

/** How long to wait before retrying a refused send. An offline refusal right after a
 * delivery is usually the app still switching itself back on, so it is retried soon. */
function retryAfterMs(error: string | undefined): number {
  return error === DRIVER_OFFLINE ? 10_000 : 30_000;
}

/** When a refused row may be tried again, or null when its last send wasn't refused. */
export function retryAtOf(entry: QueueEntry): number | null {
  const attemptedAt = timeOf(entry.lastAttemptAt);
  if (!entry.lastError || attemptedAt === null) return null;
  return attemptedAt + retryAfterMs(entry.lastError);
}

/** The states every reader asks for: rows still in a line, and rows recently sent. */
export const READ_STATES: QueueState[] = ['queued', 'dispatching', 'dispatched'];

export function timeOf(date: ParseDateJSON | string | undefined | null): number | null {
  const iso = typeof date === 'string' ? date : date?.iso;
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : null;
}

/* ---- one row ------------------------------------------------------------------ */

/**
 * - `keep` — nothing has ended the row: still waiting its turn, or sent and not taken.
 * - `accept` — the order carries this very driver. However it reached them (this queue,
 *   ops by hand, a console that closed before recording the send), they took it, and the
 *   row is closed as `accepted`. What happens to the order after that is between the
 *   driver and ops — see the note on cancelling at the top of this file.
 * - `drop` — the order no longer needs the row.
 */
export type EntryVerdict = { kind: 'keep' } | { kind: 'accept' } | { kind: 'drop'; reason: DropReason };

export function entryVerdict(entry: QueueEntry): EntryVerdict {
  const order = entry.order;
  const driverId = entry.driver?.objectId;
  if (!order?.objectId || !driverId) return { kind: 'drop', reason: 'missing' };
  if (order.canceled) return { kind: 'drop', reason: 'canceled' };
  if ((order.status ?? 0) >= 3) return { kind: 'drop', reason: 'delivered' };
  if (order.deliveryType !== 'delivery') return { kind: 'drop', reason: 'notDelivery' };
  const carrier = order.driver?.objectId;
  if (carrier && carrier !== driverId) return { kind: 'drop', reason: 'assignedElsewhere' };
  if (carrier === driverId) return { kind: 'accept' };
  return { kind: 'keep' };
}

/** A console is calling `assignDriver` for it right now. */
export function isBeingSent(entry: QueueEntry, now: number): boolean {
  if (entry.state !== 'dispatching') return false;
  const claimedAt = timeOf(entry.claimedAt);
  return claimedAt !== null && now - claimedAt < CLAIM_TIMEOUT_MS;
}

/**
 * When the row's order went out to its driver, or null if it hasn't.
 *
 * A claim that timed out counts as sent, at the moment it was claimed. The console that
 * claimed it closed or lost its connection before recording how the send went, and the
 * longest step in between is `assignDriver` itself, so the order most likely went out.
 * Putting the row back in line instead would send it a second time — and put it back in
 * the driver's queue if they had taken it and cancelled in between.
 */
export function sentAtOf(entry: QueueEntry, now: number): number | null {
  if (entry.state === 'dispatched') return timeOf(entry.dispatchedAt);
  if (entry.state === 'dispatching' && !isBeingSent(entry, now)) return timeOf(entry.claimedAt);
  return null;
}

/**
 * Sent, and not on anyone yet: the driver has been offered it and hasn't taken it.
 *
 * The order row alone can't tell a driver who hasn't answered from one who accepted and
 * then cancelled: both leave it with no driver. The runner tells them apart by closing a
 * row as `accepted` the first time it sees the driver carrying the order, after which the
 * row isn't read at all. A cancel faster than one runner tick, or made while no console
 * was open, still reads as unanswered until `OFFER_GRACE_MS` runs out: shown as offered,
 * never sent again.
 */
export function isPendingOffer(entry: QueueEntry, now: number): boolean {
  const sentAt = sentAtOf(entry, now);
  return sentAt !== null && now - sentAt < OFFER_GRACE_MS && entryVerdict(entry).kind === 'keep';
}

/* ---- lines -------------------------------------------------------------------- */

export type LineUp = {
  driverId: string;
  /** The driver's row as the queue read included it. */
  driver: DriverParty | undefined;
  /** Waiting their turn, first in line first. Can be empty when all the line holds is
   * an offer. */
  entries: QueueEntry[];
  /** Sent to this driver and not accepted yet. It holds the line — see `OFFER_GRACE_MS`. */
  offer: QueueEntry | null;
};

export type QueueReview = {
  /** One line per driver who has anything waiting or offered. */
  lines: Map<string, LineUp>;
  /**
   * Sent from the queue, never taken, and the offer has run out — the latest such row per
   * order, for orders that aren't in a line or on offer again.
   *
   * Nothing is written for these. The order is already back to needing a driver; the row
   * is only what lets the screen say *why*: it went to this driver, and they never
   * accepted. A new assign or queue for the order closes or hides it.
   */
  lapsed: QueueEntry[];
  drops: { entry: QueueEntry; reason: DropReason }[];
  /** Rows whose driver has taken the order, to close as `accepted`. */
  accepts: QueueEntry[];
  /** Timed-out claims, to record as sent — see `sentAtOf`. */
  unconfirmed: QueueEntry[];
};

function byRank(a: QueueEntry, b: QueueEntry): number {
  return (a.rank ?? 0) - (b.rank ?? 0) || (timeOf(a.createdAt) ?? 0) - (timeOf(b.createdAt) ?? 0);
}

/**
 * Sorts rows into lines, one per driver, and says which rows no longer belong in one.
 *
 * Only `queued` rows and claims still in flight wait in a line. Every other row read has
 * been sent: it is an offer while it is fresh, and it is closed as soon as its order shows
 * what became of it — taken, cancelled, delivered, or gone to another driver.
 *
 * An order can only be in one line. Two rows for the same order happen when two consoles
 * queue it at the same moment. The older one stands and the other is dropped, so every
 * console, reading the same rows, keeps the same one.
 */
export function reviewQueue(entries: readonly QueueEntry[], now: number): QueueReview {
  const lines = new Map<string, LineUp>();
  const drops: QueueReview['drops'] = [];
  const accepts: QueueEntry[] = [];
  const unconfirmed: QueueEntry[] = [];

  const lineOf = (driverId: string, driver: DriverParty | undefined): LineUp => {
    let line = lines.get(driverId);
    if (!line) {
      line = { driverId, driver, entries: [], offer: null };
      lines.set(driverId, line);
    }
    return line;
  };

  const live = entries
    .filter((entry) => entry.state !== undefined && READ_STATES.includes(entry.state))
    .sort((a, b) => (timeOf(a.createdAt) ?? 0) - (timeOf(b.createdAt) ?? 0));

  const inLine = new Set<string>();
  const sent: QueueEntry[] = [];
  for (const entry of live) {
    const verdict = entryVerdict(entry);
    if (verdict.kind === 'drop') {
      drops.push({ entry, reason: verdict.reason });
      continue;
    }
    if (verdict.kind === 'accept') {
      accepts.push(entry);
      continue;
    }
    if (entry.state !== 'queued' && !isBeingSent(entry, now)) {
      if (entry.state === 'dispatching') unconfirmed.push(entry);
      sent.push(entry);
      continue;
    }
    // Both checked by `entryVerdict` above, which drops a row missing either.
    const orderId = entry.order!.objectId;
    if (inLine.has(orderId)) {
      drops.push({ entry, reason: 'duplicate' });
      continue;
    }
    inLine.add(orderId);
    lineOf(entry.driver!.objectId, entry.driver).entries.push(entry);
  }

  const onOffer = new Set<string>();
  const lapsedByOrder = new Map<string, QueueEntry>();
  for (const entry of sent) {
    const orderId = entry.order!.objectId;
    // An order queued again after an offer nobody took belongs to its new line.
    if (inLine.has(orderId)) continue;
    const sentAt = sentAtOf(entry, now);
    if (sentAt === null) continue;
    if (isPendingOffer(entry, now)) {
      onOffer.add(orderId);
      const line = lineOf(entry.driver!.objectId, entry.driver);
      if (!line.offer || sentAt > (sentAtOf(line.offer, now) ?? 0)) line.offer = entry;
      continue;
    }
    const known = lapsedByOrder.get(orderId);
    if (!known || sentAt > (sentAtOf(known, now) ?? 0)) lapsedByOrder.set(orderId, entry);
  }
  // Sent again since, to this driver or another, and that offer is still open.
  const lapsed = [...lapsedByOrder.values()].filter((entry) => !onOffer.has(entry.order!.objectId));

  for (const line of lines.values()) line.entries.sort(byRank);
  return { lines, lapsed, drops, accepts, unconfirmed };
}

/**
 * Where an order stands in the queue.
 *
 * - `waiting` — in a driver's line; `position` 1 goes next.
 * - `offered` — sent from the queue, not accepted by the driver yet.
 * - `lapsed` — sent from the queue, never accepted, and the offer has run out. Unlike the
 *   other two, the order is back with ops: it needs a driver.
 */
export type QueueSlot =
  | { kind: 'waiting'; entry: QueueEntry; driverId: string; position: number }
  | { kind: 'offered'; entry: QueueEntry; driverId: string }
  | { kind: 'lapsed'; entry: QueueEntry; driverId: string };

/** Every order the queue holds or has let lapse, by order id. */
export function queueSlots({ lines, lapsed }: Pick<QueueReview, 'lines' | 'lapsed'>): Map<string, QueueSlot> {
  const slots = new Map<string, QueueSlot>();
  // Present on every row: `reviewQueue` drops rows without an order or a driver.
  for (const entry of lapsed) {
    slots.set(entry.order!.objectId, { kind: 'lapsed', entry, driverId: entry.driver!.objectId });
  }
  for (const line of lines.values()) {
    line.entries.forEach((entry, index) => {
      slots.set(entry.order!.objectId, { kind: 'waiting', entry, driverId: line.driverId, position: index + 1 });
    });
    if (line.offer?.order) {
      slots.set(line.offer.order.objectId, { kind: 'offered', entry: line.offer, driverId: line.driverId });
    }
  }
  return slots;
}

/* ---- who goes next ------------------------------------------------------------ */

/**
 * What is keeping a line's first order from going out.
 *
 * - `sending` — a console is on it.
 * - `busy` — the driver is still carrying an order.
 * - `offer` — the last one sent hasn't been accepted yet.
 * - `offline` — nothing to carry, but the app isn't online, so `assignDriver` would
 *   refuse. For a moment that is the app switching itself back on after a delivery. For
 *   longer, it is a driver who paused or closed the app.
 * - `retrying` — the last attempt was refused and the wait before the next isn't over.
 */
export type LineHold = 'sending' | 'busy' | 'offer' | 'offline' | 'retrying';

export type DriverNow = {
  /** Carrying an open order. */
  isBusy: boolean;
  /** `driverActive` on their freshest row. */
  isOnline: boolean;
};

/** Why the first order in `line` can't go yet, or null when it should go now. A line with
 * nothing waiting has nothing to hold, and is null too. */
export function holdOf(line: LineUp, driver: DriverNow, now: number): LineHold | null {
  const head = line.entries[0];
  if (!head) return null;
  if (isBeingSent(head, now)) return 'sending';
  if (driver.isBusy) return 'busy';
  if (line.offer) return 'offer';
  if (!driver.isOnline) return 'offline';
  const retryAt = retryAtOf(head);
  if (retryAt !== null && now < retryAt) return 'retrying';
  return null;
}

/**
 * Where a queued order's send stands — the one answer to "has it gone, is it about to,
 * is it stuck?", which every screen showing the queue reads from.
 *
 * - `behind` — in line, with orders ahead of it.
 * - `held` — first in line, waiting on the driver (`hold` says how).
 * - `ready` — first in line and nothing holds it: the runner's next look sends it.
 * - `sending` — a console is calling `assignDriver` for it now.
 * - `retrying` — the last send was refused; the runner tries again at `retryAt`.
 * - `offered` — sent at `sentAt`, not accepted; the offer runs out at `expiresAt`.
 * - `lapsed` — sent at `sentAt`, never accepted, and the offer has run out.
 *
 * `attempts` is the row's claim counter: every send the runner started, including ones
 * refused. Two consoles racing for the same send both count, so read it as "at least".
 * `lastError` rides along on the held states too — a driver who went offline after a
 * refusal is still one whose last send was refused.
 */
export type SendStatus =
  | { kind: 'behind'; position: number }
  | { kind: 'held'; hold: 'busy' | 'offer' | 'offline'; lastError: string | null; attempts: number }
  | { kind: 'ready'; lastError: string | null; attempts: number }
  | { kind: 'sending'; since: number | null }
  | { kind: 'retrying'; lastError: string; retryAt: number; attempts: number }
  | { kind: 'offered'; sentAt: number | null; expiresAt: number | null; attempts: number }
  | { kind: 'lapsed'; sentAt: number | null; attempts: number };

/** `hold` is the slot's line's, from `holdOf`. It only matters for the first in line. */
export function sendStatusOf(slot: QueueSlot, hold: LineHold | null, now: number): SendStatus {
  const { entry } = slot;
  const attempts = entry.claim ?? 0;
  const lastError = entry.lastError ?? null;

  if (slot.kind !== 'waiting') {
    const sentAt = sentAtOf(entry, now);
    return slot.kind === 'offered'
      ? { kind: 'offered', sentAt, expiresAt: sentAt === null ? null : sentAt + OFFER_GRACE_MS, attempts }
      : { kind: 'lapsed', sentAt, attempts };
  }
  if (slot.position > 1) return { kind: 'behind', position: slot.position };

  switch (hold) {
    case 'sending':
      return { kind: 'sending', since: timeOf(entry.claimedAt) };
    case 'retrying':
      return { kind: 'retrying', lastError: lastError ?? '', retryAt: retryAtOf(entry) ?? now, attempts };
    case null:
      return { kind: 'ready', lastError, attempts };
    default:
      return { kind: 'held', hold, lastError, attempts };
  }
}

export type TickPlan = QueueReview & {
  /** The first order of each line that may go now: at most one per driver. */
  sends: QueueEntry[];
};

/**
 * One look at the queue, as the runner takes it.
 *
 * `busyDriverIds` is every queued driver carrying an open order, from a read made
 * alongside the queue's. Online-ness comes from the driver rows the queue read included.
 */
export function planQueueTick(
  entries: readonly QueueEntry[],
  busyDriverIds: ReadonlySet<string>,
  now: number,
): TickPlan {
  const review = reviewQueue(entries, now);
  const sends: QueueEntry[] = [];
  for (const line of review.lines.values()) {
    const head = line.entries[0];
    if (!head) continue;
    const hold = holdOf(
      line,
      { isBusy: busyDriverIds.has(line.driverId), isOnline: line.driver?.driverActive === true },
      now,
    );
    if (hold === null) sends.push(head);
  }
  return { ...review, sends };
}

/** What a refused `assignDriver` means for the row. The two refusals about the order are
 * final. Anything else (the driver offline, the network) is worth another try. */
export function outcomeOfRefusal(
  message: string | undefined,
): { kind: 'drop'; reason: DropReason } | { kind: 'retry' } {
  if (message === 'ORDER_CANCELED') return { kind: 'drop', reason: 'canceled' };
  // Sic — the backend's spelling.
  if (message === 'ORDER_FULLFILLED') return { kind: 'drop', reason: 'assignedElsewhere' };
  return { kind: 'retry' };
}
