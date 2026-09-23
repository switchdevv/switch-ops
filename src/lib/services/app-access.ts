import {
  accountBlockOf,
  sameApps,
  type Actor,
  type AppAccessAccount,
  type AppAccessPlan,
} from '@/lib/ops/app-access';
import { runFunction } from '@/lib/parse/cloud';
import { APP_ACCESS_CHANGED, APP_ACCESS_NOT_FOUND, APP_ACCESS_SELF, getErrorMessage } from '@/lib/parse/errors';
import { settleQueueAfterDriverDisabled } from '@/lib/services/queue';
import { setOpsAccess } from '@/lib/services/staff';

/**
 * Which apps an account may use — written through the platform's functions only, like every
 * `_User` write in this console: `editUser` for `appType` (and `staffType` when Staff is
 * granted), switch-server-v2's `removeStaff` to take someone off the team, `setOpsAccess`
 * for the console grant. See lib/ops/app-access.ts for what each box means.
 *
 * On the legacy server nothing checks region or role, so the rules a staff account works
 * under are applied here, on a fresh read, before any call.
 */

type RawUser = Record<string, unknown>;

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** A pointer's id, whether `getUsers` returned it as a pointer literal or — an include — as
 * a whole object. */
function idOf(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as { objectId?: unknown; id?: unknown };
  return stringOf(record.objectId) || stringOf(record.id);
}

/**
 * The account, read fresh through `getUsers`. Its search is `startsWith`, so the result is
 * matched on the exact id; the raw row carries push tokens and auth data, so it is narrowed
 * on the spot.
 */
export async function getAppAccessAccount(id: string): Promise<AppAccessAccount | null> {
  const response = await runFunction<Record<string, unknown>, { results?: RawUser[] }>('getUsers', {
    limit: 1,
    skip: 0,
    search: { key: 'objectId', value: id },
  });
  const raw = (response?.results ?? []).find((row) => row.objectId === id);
  if (!raw) return null;

  const store = raw.managerStore as RawUser | undefined;
  const storeId = idOf(store);
  return {
    objectId: id,
    fullname: stringOf(raw.fullname),
    username: stringOf(raw.username),
    email: stringOf(raw.email),
    phone: stringOf(raw.phone),
    regionId: idOf(raw.city),
    appType: Array.isArray(raw.appType) ? raw.appType.filter((type): type is string => typeof type === 'string') : [],
    staffType: stringOf(raw.staffType),
    managerStore: storeId ? { objectId: storeId, name: stringOf(store?.name) } : null,
  };
}

export type AppAccessResult = {
  /** Staff was granted but the Ops grant after it didn't go through. */
  opsGrantFailed: boolean;
};

/**
 * Applies a plan made on `shown` — the account as the dialog displayed it. Re-read first and
 * refused if it has changed since, or if this actor may not touch it.
 *
 * `removeStaff` goes first: it doesn't exist on the legacy server, and failing there leaves
 * nothing half-done. The Ops grant goes last and doesn't fail the whole — the account is
 * staff by then, and /access can grant it again.
 */
export async function saveAppAccess(shown: AppAccessAccount, plan: AppAccessPlan, actor: Actor): Promise<AppAccessResult> {
  const fresh = await getAppAccessAccount(shown.objectId);
  const block = accountBlockOf(fresh, actor);
  if (block === 'self') throw new Error(APP_ACCESS_SELF);
  if (block || !fresh) throw new Error(APP_ACCESS_NOT_FOUND);
  if (!sameApps(fresh, shown)) throw new Error(APP_ACCESS_CHANGED);
  const touchesStaff = plan.removeStaff || plan.change.granted.includes('staff');
  if (touchesStaff && actor.role !== 'admin') throw new Error(APP_ACCESS_NOT_FOUND);

  if (plan.removeStaff) await runFunction('removeStaff', { userId: shown.objectId });
  if (plan.edit) await runFunction('editUser', plan.edit);

  if (plan.change.revoked.includes('driver')) {
    // Orders lined up behind them go back to needing a driver, as when a driver is
    // deactivated. Logged, not thrown: the app access has already changed.
    await settleQueueAfterDriverDisabled(shown.objectId).catch((error: unknown) => {
      if (process.env.NODE_ENV !== 'production') console.error('[queue] after driver app removed', error);
    });
  }

  let opsGrantFailed = false;
  if (plan.grantOps) {
    try {
      await setOpsAccess(shown.objectId, true);
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') console.error('[access] ops grant', getErrorMessage(error));
      opsGrantFailed = true;
    }
  }
  return { opsGrantFailed };
}
