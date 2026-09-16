import {
  CLAIM_TIMEOUT_MS,
  outcomeOfRefusal,
  planQueueTick,
  READ_STATES,
  isBeingSent,
  timeOf,
} from '@/lib/ops/queue';
import { getErrorMessage, QUEUE_SENDING } from '@/lib/parse/errors';
import {
  createObject,
  currentUserId,
  dateField,
  deleteField,
  incrementField,
  pointerField,
  updateObject,
} from '@/lib/parse/objects';
import { find, findOne, pointer } from '@/lib/parse/query';
import { assignDriver, ONGOING_WINDOW_HOURS } from '@/lib/services/dispatch';
import { notifyDriverQueued } from '@/lib/services/notify';
import type { Order } from '@/types/order';
import type { DropReason, QueueEntry, QueueState } from '@/types/queue';

const QUEUE = 'DispatchQueue';
const ORDER = 'Order';

/**
 * The Parse role switch-dashboard shares write access with (src/configs/index.js
 * `staffRoleName`), so any ops account can reorder, remove or send a row another one
 * queued. Rows are publicly readable, like the dashboard's restaurants.
 */
const STAFF_ROLE = 'Staff';

/** The rows still waiting their turn — the ones a line is made of. */
const WAITING_STATES: QueueState[] = ['queued', 'dispatching'];

function windowStart(): Date {
  return new Date(Date.now() - ONGOING_WINDOW_HOURS * 60 * 60 * 1000);
}

/* ---- reads -------------------------------------------------------------------- */

/**
 * Every row still in a line or recently sent, in one region or all, with its order and
 * driver included.
 *
 * Bounded by the map's own window: a row older than that is for an order the map no
 * longer shows, and no line should be held by something nobody can see.
 */
export function listQueue(region: string): Promise<QueueEntry[]> {
  return find<QueueEntry>(QUEUE, [
    { containedIn: { key: 'state', value: READ_STATES } },
    { greaterThanOrEqualTo: { key: 'createdAt', value: windowStart() } },
    region ? { equalTo: { key: 'city', value: pointer('City', region) } } : {},
    { include: 'order' },
    { include: 'driver' },
    { ascending: 'rank' },
    { limit: 1000 },
  ]);
}

/**
 * Which of these drivers are carrying an open order — the same test, in the same window,
 * the map uses to paint a driver "on a job".
 */
async function listBusyDrivers(driverIds: string[]): Promise<Set<string>> {
  if (driverIds.length === 0) return new Set();
  const rows = await find<Pick<Order, 'objectId' | 'driver'>>(ORDER, [
    { containedIn: { key: 'driver', value: driverIds.map((id) => pointer('_User', id)) } },
    { equalTo: { key: 'canceled', value: false } },
    { lessThan: { key: 'status', value: 3 } },
    { greaterThanOrEqualTo: { key: 'createdAt', value: windowStart() } },
    { select: ['driver'] },
    { limit: 1000 },
  ]);
  const busy = new Set<string>();
  for (const row of rows) if (row.driver?.objectId) busy.add(row.driver.objectId);
  return busy;
}

/* ---- what ops do -------------------------------------------------------------- */

export type QueueRequest = {
  orderId: string;
  driverId: string;
  /** The order's region, copied onto the row so a region's consoles can find it. */
  cityId: string | null;
};

/**
 * Puts an order at the end of a driver's line. An order already in someone's line is
 * moved there instead: one row per order, rewritten rather than duplicated.
 *
 * Reads fresh instead of trusting the screen, because the new rank has to land after
 * whatever is at the end of the line *now*, including anything another console added
 * since the last refresh.
 */
export async function queueOrder({ orderId, driverId, cityId }: QueueRequest): Promise<void> {
  const [existing, last] = await Promise.all([
    find<QueueEntry>(QUEUE, [
      { equalTo: { key: 'order', value: pointer('Order', orderId) } },
      { containedIn: { key: 'state', value: WAITING_STATES } },
      { ascending: 'createdAt' },
    ]),
    findOne<QueueEntry>(QUEUE, [
      { equalTo: { key: 'driver', value: pointer('_User', driverId) } },
      { containedIn: { key: 'state', value: WAITING_STATES } },
      { descending: 'rank' },
    ]),
  ]);

  const now = Date.now();
  const rank = Math.max(now, (last?.rank ?? 0) + 1);
  const queuedBy = currentUserId();
  const row = existing[0];

  if (!row) {
    await createObject(
      QUEUE,
      {
        order: pointerField('Order', orderId),
        driver: pointerField('_User', driverId),
        ...(cityId ? { city: pointerField('City', cityId) } : {}),
        ...(queuedBy ? { queuedBy: pointerField('_User', queuedBy) } : {}),
        rank,
        state: 'queued',
        claim: 0,
      },
      { publicRead: true, role: STAFF_ROLE, userWrite: driverId },
    );
    notifyDriverQueued(driverId, orderId);
    return;
  }

  // Already in this very line: nothing to move.
  if (row.driver?.objectId === driverId) return;
  // A console is sending it to the other driver this second. Moving it now would
  // record one driver while the other's phone rings.
  if (isBeingSent(row, now)) throw new Error(QUEUE_SENDING);

  await updateObject(
    QUEUE,
    row.objectId,
    {
      driver: pointerField('_User', driverId),
      ...(queuedBy ? { queuedBy: pointerField('_User', queuedBy) } : {}),
      rank,
      state: 'queued',
      lastError: deleteField(),
      lastAttemptAt: deleteField(),
    },
    // The ACL is rewritten with the driver, not just left alone: it names one driver as able to
    // change the row, so a row that moves would otherwise keep letting the previous driver hand
    // back an order that is now someone else's.
    { publicRead: true, role: STAFF_ROLE, userWrite: driverId },
  );
  notifyDriverQueued(driverId, orderId);
}

/** Takes a row out of its line. */
export async function removeFromQueue(entryId: string): Promise<void> {
  await updateObject(QUEUE, entryId, { state: 'removed' });
}

/**
 * Lets a refused row go on the runner's next look instead of waiting out its retry delay.
 *
 * Only the wait is cleared. The send stays the runner's, through its claim, so pressing
 * this in two consoles at once still sends the order once.
 */
export async function retryQueuedNow(entryId: string): Promise<void> {
  await updateObject(QUEUE, entryId, { lastAttemptAt: deleteField() });
}

/** Swaps a row with the one ahead of it. */
export async function swapRanks(entry: QueueEntry, ahead: QueueEntry): Promise<void> {
  const mine = entry.rank ?? 0;
  const theirs = ahead.rank ?? 0;
  // Equal ranks can't be swapped into an order; step in front instead.
  const target = mine === theirs ? theirs - 1 : theirs;
  await Promise.all([
    updateObject(QUEUE, entry.objectId, { rank: target }),
    mine === theirs ? Promise.resolve() : updateObject(QUEUE, ahead.objectId, { rank: mine }),
  ]);
}

/**
 * Brings the queue in line with a driver ops just assigned by hand.
 *
 * An assign is a newer decision than any queueing, so the order leaves every line it was
 * in. Left behind someone else, it would go out to them on its own should the driver ops
 * chose decline or cancel — back in a queue nobody put it in. Behind this same driver,
 * the assign did the queue's job: the row is recorded as sent, and holds the rest of
 * their line until they take it, as a send from the queue would.
 *
 * A row a console is sending this second is left to that send.
 */
export async function settleQueueAfterAssign(orderId: string, driverId: string): Promise<void> {
  const rows = await find<QueueEntry>(QUEUE, [
    { equalTo: { key: 'order', value: pointer('Order', orderId) } },
    { containedIn: { key: 'state', value: READ_STATES } },
    { limit: 1000 },
  ]);
  const now = Date.now();
  await Promise.all(
    rows
      .filter((row) => !isBeingSent(row, now))
      .map((row) =>
        row.driver?.objectId === driverId
          ? updateObject(QUEUE, row.objectId, {
              state: 'dispatched',
              dispatchedAt: dateField(new Date(now)),
              lastError: deleteField(),
            })
          : markDropped(row, 'assignedElsewhere'),
      ),
  );
}

/**
 * Brings the queue in line with ops taking the driver off an order.
 *
 * Every row of the order leaves its line. The order goes back to needing a driver — the
 * same place a driver's own cancel hands it — so a row still waiting behind someone (one
 * no console had tidied while the order was carried) must not send it out on its own, and
 * a sent row must not keep holding the unassigned driver's line as an open offer.
 *
 * A row a console is sending this second is left to that send.
 */
export async function settleQueueAfterUnassign(orderId: string): Promise<void> {
  const rows = await find<QueueEntry>(QUEUE, [
    { equalTo: { key: 'order', value: pointer('Order', orderId) } },
    { containedIn: { key: 'state', value: READ_STATES } },
    { limit: 1000 },
  ]);
  const now = Date.now();
  await Promise.all(
    rows.filter((row) => !isBeingSent(row, now)).map((row) => markDropped(row, 'unassigned')),
  );
}

/**
 * Brings the queue in line with ops deactivating a driver.
 *
 * A deactivated account is one `assignDriver` refuses (`beforeLogin` and the assign both
 * check `enabled`), so every order still waiting behind that driver would sit in their
 * line being refused until somebody noticed. They go back to needing a driver instead,
 * which is where the manual-dispatch rule puts them: ops choose again.
 *
 * A sent row that hasn't been accepted goes too: left alone it would hold the order as
 * "sent to them, not accepted yet" for the rest of its offer window, an order nobody may
 * now carry. A row a console is sending this second is left to that send.
 */
export async function settleQueueAfterDriverDisabled(driverId: string): Promise<void> {
  const rows = await find<QueueEntry>(QUEUE, [
    { equalTo: { key: 'driver', value: pointer('_User', driverId) } },
    { containedIn: { key: 'state', value: READ_STATES } },
    { limit: 1000 },
  ]);
  const now = Date.now();
  await Promise.all(
    rows.filter((row) => !isBeingSent(row, now)).map((row) => markDropped(row, 'driverDisabled')),
  );
}

/* ---- what the runner does ----------------------------------------------------- */

/**
 * Claims a row for sending. True when this console holds the claim and may call
 * `assignDriver`, false when another console got there first.
 *
 * `claim` is a counter every claimant increments. The increment is atomic on the server,
 * so two consoles claiming at once get different numbers back, and only the one whose
 * number is `seen + 1` (the value it read, plus its own increment) goes ahead. If the
 * server doesn't echo the counter, the row is read back instead. That answers the same
 * question a request later, and at worst makes both back off until the claim times out;
 * it never lets both through.
 */
async function claimEntry(entry: QueueEntry): Promise<boolean> {
  const seen = entry.claim ?? 0;
  const response = await updateObject(QUEUE, entry.objectId, {
    claim: incrementField(),
    state: 'dispatching',
    claimedAt: dateField(new Date()),
  });

  let claim = typeof response.claim === 'number' ? response.claim : null;
  if (claim === null) {
    const row = await findOne<QueueEntry>(QUEUE, [
      { equalTo: { key: 'objectId', value: entry.objectId } },
      { select: ['claim'] },
    ]);
    claim = row?.claim ?? null;
  }
  return claim === seen + 1;
}

function markSent(entry: QueueEntry) {
  return updateObject(QUEUE, entry.objectId, {
    state: 'dispatched',
    dispatchedAt: dateField(new Date()),
    lastError: deleteField(),
  });
}

/** Closes a row whose driver has taken the order. One the queue never recorded sending —
 * assigned by hand, or by a console that closed mid-send — is given a send time now. */
function markAccepted(entry: QueueEntry) {
  return updateObject(QUEUE, entry.objectId, {
    state: 'accepted',
    ...(entry.dispatchedAt ? {} : { dispatchedAt: dateField(new Date()) }),
    lastError: deleteField(),
  });
}

/** Records a timed-out claim as sent, when it was claimed — see `sentAtOf`. */
function markUnconfirmedSent(entry: QueueEntry) {
  return updateObject(QUEUE, entry.objectId, {
    state: 'dispatched',
    dispatchedAt: dateField(new Date(timeOf(entry.claimedAt) ?? Date.now())),
  });
}

function markDropped(entry: QueueEntry, reason: DropReason) {
  return updateObject(QUEUE, entry.objectId, { state: 'dropped', dropReason: reason });
}

function markRetry(entry: QueueEntry, message: string) {
  return updateObject(QUEUE, entry.objectId, {
    state: 'queued',
    lastError: message,
    lastAttemptAt: dateField(new Date()),
  });
}

/**
 * One look at the queue: tidy what no longer belongs, and send the first order of every
 * line whose driver is free. Returns whether anything was written, so the caller knows
 * to refresh what is on screen.
 *
 * Several consoles may run this at once — every open tab of every dispatcher. The
 * tidying is idempotent (each writes the same answer), and sending goes through
 * `claimEntry`, so an order is only ever sent once.
 *
 * `signal` aborts when the runner abandons the look for taking too long
 * (`TICK_TIMEOUT_MS`), or stops leading. From then on the look starts nothing: a newer
 * one is deciding from fresher rows. A send already under way still records how it went.
 */
export async function runQueueTick(region: string, signal?: AbortSignal): Promise<{ changed: boolean }> {
  const isAbandoned = () => signal?.aborted === true;

  const entries = await listQueue(region);
  if (entries.length === 0 || isAbandoned()) return { changed: false };

  const waitingDrivers = new Set<string>();
  for (const entry of entries) {
    if (entry.driver?.objectId && WAITING_STATES.includes(entry.state ?? 'queued')) {
      waitingDrivers.add(entry.driver.objectId);
    }
  }
  const busy = await listBusyDrivers([...waitingDrivers]);
  if (isAbandoned()) return { changed: false };
  const plan = planQueueTick(entries, busy, Date.now());

  let changed = false;
  for (const { entry, reason } of plan.drops) {
    if (isAbandoned()) return { changed };
    await markDropped(entry, reason);
    changed = true;
  }
  for (const entry of plan.accepts) {
    if (isAbandoned()) return { changed };
    await markAccepted(entry);
    changed = true;
  }
  for (const entry of plan.unconfirmed) {
    if (isAbandoned()) return { changed };
    await markUnconfirmedSent(entry);
    changed = true;
  }

  for (const entry of plan.sends) {
    if (isAbandoned()) return { changed };
    const claimedAt = Date.now();
    if (!(await claimEntry(entry))) continue;
    changed = true;
    try {
      // Both present: `planQueueTick` only sends rows `entryVerdict` kept.
      await assignDriver(entry.order!.objectId, entry.driver!.objectId);
    } catch (error) {
      const message = getErrorMessage(error);
      const outcome = outcomeOfRefusal(message);
      if (outcome.kind === 'drop') await markDropped(entry, outcome.reason);
      // Back in line only while the claim still holds. Once it has run out, another look
      // may already have counted the send as made (`sentAtOf`), and putting the row back
      // would send it a second time. Left alone, it counts as sent and lapses.
      else if (Date.now() - claimedAt < CLAIM_TIMEOUT_MS) await markRetry(entry, message ?? 'UNKNOWN');
      continue;
    }
    await markSent(entry);
  }

  return { changed };
}
