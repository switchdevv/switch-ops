import type { MessageKey } from '@/lib/i18n/dictionary';
import type { CallEntry, CallOutcome, Order, OrderCall } from '@/types/order';
import { stageOf } from './order-status';

/**
 * The two phone calls ops make on a new order: to the customer, to confirm it, and then to
 * the restaurant, to launch it.
 *
 * Most restaurants on the platform don't run the manager app, so nobody accepts an order
 * on their side — ops ring the customer ("is this order real, is the address right?"),
 * then ring the kitchen and read it out, then press Confirm. Nothing on the backend records
 * any of that, so this console writes it itself, onto two columns of the order
 * (`opsCustomerCall`, `opsRestaurantCall`; see docs/order-calls-backend.md), and every screen
 * decides from these functions who still needs a call.
 *
 * Deliberately free of React and Parse, like lib/ops/queue.ts.
 */

export const CALL_STEPS = ['customer', 'restaurant'] as const;

export type CallStep = (typeof CALL_STEPS)[number];

/** The `Order` column each call lives in. */
export const CALL_COLUMN = {
  customer: 'opsCustomerCall',
  restaurant: 'opsRestaurantCall',
} as const satisfies Record<CallStep, keyof Order>;

/**
 * The key the board's filters compare, as a dotted path into the column. Parse Server
 * queries a key inside an Object column this way (its key check allows the dot, and the
 * Mongo transform passes the path through), which is why `outcome` is stored beside the
 * log rather than derived from it.
 */
export function outcomeKey(step: CallStep): string {
  return `${CALL_COLUMN[step]}.outcome`;
}

/** Marks kept per call. Twenty unanswered calls is already an order someone should have
 * cancelled, and the column stays a few kilobytes at most. */
export const CALL_LOG_LIMIT = 20;

/** Where a call stands: never marked, marked unanswered (maybe several times), or done. */
export type CallState = 'todo' | CallOutcome;

export type CallView = {
  /**
   * The stored `outcome`, not the log's last entry — it is what the filters see, so a row
   * can never sit under "Customer to call" while its chip says confirmed. Anything else
   * in the column reads as not called.
   */
  state: CallState;
  /** Every readable mark, oldest first. */
  log: CallEntry[];
  last: CallEntry | null;
  /** Unanswered calls in the log. */
  missed: number;
};

export const CALL_STEP_LABEL_KEY: Record<CallStep, MessageKey> = {
  customer: 'orders.calls.step.customer',
  restaurant: 'orders.calls.step.restaurant',
};

/** What "done" is called for each call — the customer confirms, the restaurant launches. */
export const CALL_DONE_LABEL_KEY: Record<CallStep, MessageKey> = {
  customer: 'orders.calls.done.customer',
  restaurant: 'orders.calls.done.restaurant',
};

/** The board's calls filter: a call still due (customer, then restaurant), or both done. */
export const CALL_FILTERS = ['customer', 'restaurant', 'done'] as const;

export type CallFilter = (typeof CALL_FILTERS)[number];

/** Whether a calls filter asks for calls still to make, which only a placed order has. */
export function isDueFilter(filter: CallFilter | ''): filter is CallStep {
  return filter === 'customer' || filter === 'restaurant';
}

type CallFields = Pick<Order, 'status' | 'canceled' | 'opsCustomerCall' | 'opsRestaurantCall'>;

function isOutcome(value: unknown): value is CallOutcome {
  return value === 'done' || value === 'noAnswer';
}

function readEntry(value: unknown): CallEntry | null {
  if (!value || typeof value !== 'object') return null;
  const { outcome, at, by, byName } = value as Record<string, unknown>;
  if (!isOutcome(outcome) || typeof at !== 'string' || Number.isNaN(Date.parse(at))) return null;
  return {
    outcome,
    at,
    by: typeof by === 'string' ? by : '',
    byName: typeof byName === 'string' ? byName : '',
  };
}

/** A call column as far as it can be trusted. The column can be missing (never called, or
 * not created on the server yet) or hand-edited in the Parse Dashboard. */
export function viewCall(value: unknown): CallView {
  const raw = value && typeof value === 'object' ? (value as { outcome?: unknown; log?: unknown }) : {};
  const log = Array.isArray(raw.log)
    ? raw.log.map(readEntry).filter((entry): entry is CallEntry => entry !== null)
    : [];
  return {
    state: isOutcome(raw.outcome) ? raw.outcome : 'todo',
    log,
    last: log[log.length - 1] ?? null,
    missed: log.filter((entry) => entry.outcome === 'noAnswer').length,
  };
}

export function callOf(order: CallFields, step: CallStep): CallView {
  return viewCall(order[CALL_COLUMN[step]]);
}

/**
 * Whether ops can still mark this order's calls: not canceled, and the food hasn't left
 * the restaurant (placed or confirmed). Past that, the marks are history.
 *
 * Confirmed is included because Confirm can come first — pressed before the restaurant was
 * rung, or by a restaurant that runs the manager app — and the mark is still worth making.
 */
export function canMarkCalls(order: Pick<Order, 'status' | 'canceled'>): boolean {
  return !order.canceled && (order.status ?? 0) <= 1;
}

/**
 * The call to make next on this order, or null when none is due.
 *
 * Only a placed order has one: once it is confirmed, the restaurant has accepted it — ops
 * did that on the restaurant's word, or the manager app did — so nobody is waiting on a
 * call any more. The customer comes first, because a restaurant shouldn't cook an order
 * nobody has confirmed; an unanswered call is still due.
 */
export function nextCallDue(order: CallFields): CallStep | null {
  if (stageOf(order) !== 'new') return null;
  for (const step of CALL_STEPS) {
    if (callOf(order, step).state !== 'done') return step;
  }
  return null;
}

/** Whether an order shows its calls at all: while they can be marked, and afterwards
 * only if someone did mark one. */
export function showsCalls(order: CallFields): boolean {
  if (canMarkCalls(order)) return true;
  return CALL_STEPS.some((step) => {
    const call = callOf(order, step);
    return call.state !== 'todo' || call.log.length > 0;
  });
}

/** The calls not marked done yet, in the order they are made. */
export function callsNotDone(order: CallFields): CallStep[] {
  return CALL_STEPS.filter((step) => callOf(order, step).state !== 'done');
}

/**
 * What to write to a call column, decided against the value just re-read from the server.
 * `stale` means the screen ops acted on is behind: the call was marked or taken back from
 * another console in the meantime.
 */
export type CallWrite =
  | { kind: 'save'; value: OrderCall }
  | { kind: 'clear' }
  | { kind: 'unchanged' }
  | { kind: 'stale' };

/**
 * Adds a mark. Another unanswered call adds to the ones before it, and a call answered
 * after them keeps them in its history.
 *
 * Done is final until someone takes it back: marking it again changes nothing (two agents
 * pressed it together), and "no answer" on a call already done is a screen that was behind.
 */
export function addCallMark(current: unknown, entry: CallEntry): CallWrite {
  const call = viewCall(current);
  if (call.state === 'done') return entry.outcome === 'done' ? { kind: 'unchanged' } : { kind: 'stale' };
  return {
    kind: 'save',
    value: { outcome: entry.outcome, log: [...call.log, entry].slice(-CALL_LOG_LIMIT) },
  };
}

/**
 * Takes back the last mark — the one ops saw, recognised by its time, so an Undo pressed on
 * a screen that is behind can't take back somebody else's newer mark. The call returns to
 * the mark before it, or to never called, which clears the column: a filter asking for
 * calls not done has to find nothing there.
 */
export function undoCallMark(current: unknown, expectedAt: string): CallWrite {
  const call = viewCall(current);
  if (!call.last || call.last.at !== expectedAt) return { kind: 'stale' };
  const log = call.log.slice(0, -1);
  const previous = log[log.length - 1];
  return previous ? { kind: 'save', value: { outcome: previous.outcome, log } } : { kind: 'clear' };
}
