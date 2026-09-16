import { STAFF_APP_TYPES } from '@/lib/auth/access';
import type { MessageKey } from '@/lib/i18n/dictionary';
import type { DriverRow } from '@/types/driver';
import type { DispatchOrderRow } from '@/types/order';
import type { QueueEntry } from '@/types/queue';
import { DRIVER_ONLINE_WINDOW_MS, DRIVER_SIGNAL_TIMEOUT_MS, matches } from './dispatch';
import { reviewQueue } from './queue';

/**
 * What the Drivers screen knows about a driver, decided once from plain rows.
 *
 * Free of React and Parse, like lib/ops/dispatch.ts — the list, the row, the detail and
 * every dialog read their answers from here, so none of them can disagree about whether
 * someone is online or whether an account may be touched.
 */

/**
 * - `delivering` — carrying an open order right now.
 * - `online` — their app says GO and the row has been written recently.
 * - `offline` — the account works, but the app isn't reporting.
 * - `deactivated` — `enabled` is off: they cannot sign in, and `assignDriver` refuses
 *   them. The one state that is ops' own doing.
 *
 * Deliberately not the map's `DriverState` (available / busy / signalLost). That one
 * answers "can I send this person an order right now"; this one answers "what is this
 * account", which is what a list of the fleet is for — and it has to have somewhere to
 * put a deactivated account, which never reaches the map at all.
 */
export const DRIVER_STATUSES = ['delivering', 'online', 'offline', 'deactivated'] as const;

export type DriverStatus = (typeof DRIVER_STATUSES)[number];

/** Delivering first, then who could take work, then who can't, then who may not. */
const STATUS_RANK: Record<DriverStatus, number> = {
  delivering: 0,
  online: 1,
  offline: 2,
  deactivated: 3,
};

/**
 * The palette tokens the rest of the console already uses for these meanings: a driver on
 * a job is the map's `withDriver` blue, a free one its `available` green, and a
 * deactivated account is the only red — it is the state that stops work.
 */
export const DRIVER_STATUS_COLOR_VAR: Record<DriverStatus, string> = {
  delivering: 'var(--accent)',
  online: 'var(--success)',
  offline: 'var(--faint)',
  deactivated: 'var(--danger)',
};

/** The HeroUI `Chip` colour for each status, as `StageChip` does it for an order. */
export const DRIVER_STATUS_TONE: Record<DriverStatus, 'accent' | 'success' | 'default' | 'danger'> = {
  delivering: 'accent',
  online: 'success',
  offline: 'default',
  deactivated: 'danger',
};

export const DRIVER_STATUS_LABEL_KEY: Record<DriverStatus, MessageKey> = {
  delivering: 'drivers.status.delivering',
  online: 'drivers.status.online',
  offline: 'drivers.status.offline',
  deactivated: 'drivers.status.deactivated',
};

export const DRIVER_STATUS_HINT_KEY: Record<DriverStatus, MessageKey> = {
  delivering: 'drivers.statusHint.delivering',
  online: 'drivers.statusHint.online',
  offline: 'drivers.statusHint.offline',
  deactivated: 'drivers.statusHint.deactivated',
};

export type DriverStanding = {
  status: DriverStatus;
  /** Epoch ms of the row's last write — the driver app rewrites it at least once a
   * minute while online or on an order, so it doubles as "last heard from". */
  seenAt: number | null;
  /**
   * Online by their own switch, but the app has stopped writing for longer than the map's
   * signal timeout. Kept apart from `status`, because a driver delivering an order can
   * lose signal too and is still delivering it.
   */
  isSignalLost: boolean;
};

function timeOf(iso: string | undefined): number | null {
  if (!iso) return null;
  const time = Date.parse(iso);
  return Number.isFinite(time) ? time : null;
}

/**
 * What state an account is in, from its own row plus the orders it is carrying.
 *
 * `enabled !== true` wins over everything: a deactivated driver can still have left
 * `driverActive` on — only their app ever switches that off, and disabling doesn't sign
 * them out — so reading the flags in the other order would paint someone ops has just
 * shut off as "online".
 *
 * Note the `!== true` rather than `=== false`: a row that never had `enabled` written is
 * one `beforeLogin` refuses, so this screen has to call it deactivated too. (`staffRole`
 * in lib/auth/access.ts reads the same column the other way round, and says why: there,
 * an unwritten field must not lock an admin out of the console.)
 */
export function driverStatusOf(
  row: Pick<DriverRow, 'enabled' | 'driverActive' | 'updatedAt'>,
  carryingOrderIds: readonly string[],
  now: number,
): DriverStanding {
  const seenAt = timeOf(row.updatedAt);
  const isSignalLost = seenAt === null || now - seenAt > DRIVER_SIGNAL_TIMEOUT_MS;

  if (row.enabled !== true) return { status: 'deactivated', seenAt, isSignalLost: false };
  if (carryingOrderIds.length > 0) return { status: 'delivering', seenAt, isSignalLost };

  const isRecent = seenAt !== null && now - seenAt <= DRIVER_ONLINE_WINDOW_MS;
  if (row.driverActive === true && isRecent) return { status: 'online', seenAt, isSignalLost };
  return { status: 'offline', seenAt, isSignalLost: false };
}

/**
 * An account this screen refuses to write to: a staff member, or an admin.
 *
 * Nothing on the server stops it. `editUser` always writes `staffType`, and writes
 * `undefined` when the caller doesn't send one — so editing an admin from this form would
 * silently strip their role, and a reset here would hand anyone's password to whoever is
 * signed in. The same accounts can still appear in the list (an admin who also drives is a
 * real thing), marked and with every action off.
 */
export function isProtectedAccount(row: Pick<DriverRow, 'staffType' | 'appType'>): boolean {
  if (row.staffType?.trim()) return true;
  return row.appType?.some((type) => STAFF_APP_TYPES.includes(type)) ?? false;
}

/* ---- the list ------------------------------------------------------------------ */

export type DriverView = {
  id: string;
  row: DriverRow;
  status: DriverStatus;
  seenAt: number | null;
  isSignalLost: boolean;
  /** The open orders this driver is carrying, from the live map's own read. */
  orderIds: string[];
  /** The orders lined up behind them in the dispatch queue — one sent and not accepted
   * yet first, then the line in order. */
  queuedOrderIds: string[];
  isProtected: boolean;
};

export type DriverCounts = Record<DriverStatus, number> & { all: number };

function compareNames(a: DriverView, b: DriverView): number {
  const left = a.row.fullname ?? a.row.username ?? '';
  const right = b.row.fullname ?? b.row.username ?? '';
  return left.localeCompare(right);
}

/**
 * The fleet, in the order a dispatcher scans it: who is out on a job, who could take
 * one, who can't, and who has been switched off — then by name inside each group.
 *
 * `carrying` and `queued` come from the two reads the live map already makes — see
 * `carryingByDriver` and `queuedByDriver` below — so a driver's row here says the same
 * thing as their pin there. Both are keyed by driver objectId.
 */
export function buildDriverList(
  rows: readonly DriverRow[],
  carrying: ReadonlyMap<string, string[]>,
  queued: ReadonlyMap<string, string[]>,
  now: number,
): DriverView[] {
  const views = rows.map((row) => {
    const orderIds = carrying.get(row.objectId) ?? [];
    const standing = driverStatusOf(row, orderIds, now);
    return {
      id: row.objectId,
      row,
      status: standing.status,
      seenAt: standing.seenAt,
      isSignalLost: standing.isSignalLost,
      orderIds,
      queuedOrderIds: queued.get(row.objectId) ?? [],
      isProtected: isProtectedAccount(row),
    };
  });

  return views.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || compareNames(a, b));
}

/**
 * Who is carrying what, from the live map's open-orders read (`listOngoingOrders`). Every
 * row it returns is already open — not canceled, not delivered, inside the map's window —
 * so a driver pointer on one is a driver on a job, the same test the map paints blue.
 */
export function carryingByDriver(orders: readonly Pick<DispatchOrderRow, 'objectId' | 'driver'>[]): Map<string, string[]> {
  const byDriver = new Map<string, string[]>();
  for (const order of orders) {
    const driverId = order.driver?.objectId;
    if (!driverId) continue;
    const ids = byDriver.get(driverId);
    if (ids) ids.push(order.objectId);
    else byDriver.set(driverId, [order.objectId]);
  }
  return byDriver;
}

/**
 * What is lined up behind each driver, by the queue's own rules (`reviewQueue`) — so a row
 * the runner is about to drop, or an offer that has run out, isn't counted here either.
 */
export function queuedByDriver(entries: readonly QueueEntry[], now: number): Map<string, string[]> {
  const byDriver = new Map<string, string[]>();
  for (const line of reviewQueue(entries, now).lines.values()) {
    const ids = [
      ...(line.offer?.order ? [line.offer.order.objectId] : []),
      // Present on every waiting row: `reviewQueue` drops rows without an order.
      ...line.entries.map((entry) => entry.order!.objectId),
    ];
    if (ids.length > 0) byDriver.set(line.driverId, ids);
  }
  return byDriver;
}

/** Whether a driver answers to what was typed in the list's search box: their name,
 * username or id, or the digits of their phone. */
export function driverRowMatches(row: Pick<DriverRow, 'objectId' | 'fullname' | 'username' | 'phone'>, query: string): boolean {
  return matches(query, [row.objectId, row.fullname, row.username], [row.phone]);
}

export function countDriverStatuses(views: readonly DriverView[]): DriverCounts {
  const counts: DriverCounts = { all: views.length, delivering: 0, online: 0, offline: 0, deactivated: 0 };
  for (const view of views) counts[view.status] += 1;
  return counts;
}

/** How many reviews a driver's rating is an average of. `driverParams` can be null on a
 * row older than the field, which is why this exists rather than a `?.` at each caller. */
export function reviewCountOf(row: Pick<DriverRow, 'driverParams'>): number {
  const reviews = row.driverParams?.reviews;
  return typeof reviews === 'number' && Number.isFinite(reviews) ? reviews : 0;
}
