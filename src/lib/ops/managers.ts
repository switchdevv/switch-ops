import type { MessageKey } from '@/lib/i18n/dictionary';
import type { ManagerRestaurant, ManagerRow } from '@/types/manager';
import type { RestaurantState } from './catalogue';
import { matches } from './dispatch';
import { isProtectedAccount } from './drivers';
import { restaurantHours, type WallClock } from './restaurant-hours';

/**
 * What the Managers screen knows about a manager, decided once from plain rows.
 *
 * Free of React and Parse, like lib/ops/drivers.ts — the list, the row, the detail and every
 * dialog read their answers from here.
 */

/**
 * - `running` — the account works and has a restaurant: the manager app opens on it.
 * - `noRestaurant` — the account works, but the manager app stops at "account not set up",
 *   because nothing is assigned (or what was assigned is gone).
 * - `deactivated` — `enabled` is off: they can't sign in. Ops' own doing, or the restaurant's
 *   (`toggleEnableStores` switches its manager off with it).
 */
export const MANAGER_STATUSES = ['running', 'noRestaurant', 'deactivated'] as const;

export type ManagerStatus = (typeof MANAGER_STATUSES)[number];

/** Who needs looking at first: someone who can't work yet, then who can, then who may not. */
const STATUS_RANK: Record<ManagerStatus, number> = {
  noRestaurant: 0,
  running: 1,
  deactivated: 2,
};

export const MANAGER_STATUS_COLOR_VAR: Record<ManagerStatus, string> = {
  running: 'var(--success)',
  noRestaurant: 'var(--warning)',
  deactivated: 'var(--danger)',
};

export const MANAGER_STATUS_TONE: Record<ManagerStatus, 'success' | 'warning' | 'danger'> = {
  running: 'success',
  noRestaurant: 'warning',
  deactivated: 'danger',
};

export const MANAGER_STATUS_LABEL_KEY: Record<ManagerStatus, MessageKey> = {
  running: 'managers.status.running',
  noRestaurant: 'managers.status.noRestaurant',
  deactivated: 'managers.status.deactivated',
};

export const MANAGER_STATUS_HINT_KEY: Record<ManagerStatus, MessageKey> = {
  running: 'managers.statusHint.running',
  noRestaurant: 'managers.statusHint.noRestaurant',
  deactivated: 'managers.statusHint.deactivated',
};

/**
 * How the account and its restaurant point at each other.
 *
 * - `none` — no `managerStore`.
 * - `ok` — the restaurant exists and names this account as its manager.
 * - `missing` — `managerStore` points at a restaurant that no longer exists.
 * - `mismatch` — the restaurant exists but names someone else (or no one). It happens when
 *   `assignManager` gives the restaurant a new manager and leaves this account's pointer
 *   behind, or the other way round. The manager app still opens it for them, with write
 *   access gone — and taking them "off" it through `assignManager` would unlink the
 *   restaurant's *real* manager instead, so the screen refuses that (see
 *   `removeManagerFromRestaurant`).
 */
export type RestaurantLink = 'none' | 'ok' | 'missing' | 'mismatch';

export function restaurantLinkOf(row: Pick<ManagerRow, 'objectId' | 'managerStore'>): RestaurantLink {
  const store = row.managerStore;
  if (!store?.objectId) return 'none';
  // An included row always carries `createdAt`; a pointer Parse couldn't resolve doesn't.
  if (!store.createdAt) return 'missing';
  return store.manager?.objectId === row.objectId ? 'ok' : 'mismatch';
}

/**
 * `enabled !== true` wins, for the reason `driverStatusOf` gives: a row that never had the
 * field written is one `beforeLogin` refuses.
 */
export function managerStatusOf(row: Pick<ManagerRow, 'objectId' | 'enabled' | 'managerStore'>): ManagerStatus {
  if (row.enabled !== true) return 'deactivated';
  const link = restaurantLinkOf(row);
  return link === 'none' || link === 'missing' ? 'noRestaurant' : 'running';
}

/** What a customer finds at the manager's restaurant right now — `restaurantState` in
 * lib/ops/catalogue.ts, for the restaurant as it arrives included on a manager's row. */
export function managerRestaurantState(restaurant: ManagerRestaurant, clock: WallClock): RestaurantState {
  if (restaurant.enabled !== true) return { state: 'disabled' };
  return restaurantHours(
    { ...restaurant, pauseStart: restaurant.pauseStart ?? undefined, pauseEnd: restaurant.pauseEnd ?? undefined },
    clock,
  );
}

/* ---- the list ------------------------------------------------------------------ */

export type ManagerView = {
  id: string;
  row: ManagerRow;
  status: ManagerStatus;
  link: RestaurantLink;
  /** The restaurant when it exists, whatever it says about its manager. */
  restaurant: ManagerRestaurant | null;
  isProtected: boolean;
};

export type ManagerCounts = Record<ManagerStatus, number> & { all: number };

export function toManagerView(row: ManagerRow): ManagerView {
  const link = restaurantLinkOf(row);
  return {
    id: row.objectId,
    row,
    status: managerStatusOf(row),
    link,
    restaurant: link === 'ok' || link === 'mismatch' ? (row.managerStore ?? null) : null,
    isProtected: isProtectedAccount(row),
  };
}

function compareNames(a: ManagerView, b: ManagerView): number {
  const left = a.row.fullname ?? a.row.username ?? '';
  const right = b.row.fullname ?? b.row.username ?? '';
  return left.localeCompare(right);
}

export function buildManagerList(rows: readonly ManagerRow[]): ManagerView[] {
  return rows.map(toManagerView).sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || compareNames(a, b));
}

/** Their name, username or id, the restaurant's name, or the digits of either phone. */
export function managerRowMatches(view: ManagerView, query: string): boolean {
  const { row, restaurant } = view;
  return matches(query, [row.objectId, row.fullname, row.username, restaurant?.name], [row.phone, restaurant?.phone]);
}

export function countManagerStatuses(views: readonly ManagerView[]): ManagerCounts {
  const counts: ManagerCounts = { all: views.length, running: 0, noRestaurant: 0, deactivated: 0 };
  for (const view of views) counts[view.status] += 1;
  return counts;
}
