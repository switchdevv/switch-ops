import { STAFF_APP_TYPES, type StaffRole } from '@/lib/auth/access';
import { isValidPhone, normalizePhone } from '@/lib/ops/driver-form';

/**
 * Which Switch apps an account may use — switch-dashboard's Users form, where the appType
 * checkboxes turned a customer into a driver, a restaurant manager or a staff member. Free of
 * React and Parse.
 *
 * What each app actually checks, which is what decides what a box does:
 *
 * - **Driver** — the driver app lets an account in when `appType` holds 'driver'
 *   (switch-driver src/screens/Login/Login.js, src/navigation/root.js). Nothing else: every
 *   driver column (`driverActive`, `driverParams`…) is written on every account at signup.
 * - **Manager** — the manager app needs 'manager' **and** a `managerStore`
 *   (switch-manager src/navigation/root.js). The box only gives the first half; the
 *   restaurant is linked on the Managers page (`assignManager`, which also adds 'manager').
 *   Unticking it while a restaurant is linked would leave the restaurant pointing at an
 *   account its app refuses, so that box is locked until they are taken off the restaurant.
 * - **Staff** — a `staffType` and the staff app together (lib/auth/access.ts). Granted
 *   through `editUser` with `staffType: 'Staff'`, which also puts them in the Staff role;
 *   taken away through switch-server-v2's `removeStaff`, the only call that takes someone
 *   out of the role again. Admins only — here and, on v2, on the server (D-24).
 * - **Customer** — not a box: the customer app adds 'food' itself the first time the
 *   account signs in to it (switch-food src/navigation/root.js).
 */

export type GrantableApp = 'driver' | 'manager' | 'staff';

/** The account as the dialog reads it — through `getUsers`, the only read with `email`,
 * which `editUser` requires. */
export type AppAccessAccount = {
  objectId: string;
  fullname: string;
  username: string;
  email: string;
  phone: string;
  regionId: string;
  appType: string[];
  staffType: string;
  managerStore: { objectId: string; name: string } | null;
};

export type AppSet = Record<GrantableApp, boolean>;

/** Anything that marks an account as staff, half-provisioned included — what `removeStaff`
 * accepts and what the server's admin guard protects (switch-server-v2 staff-accounts.ts). */
export function isStaffTagged(account: Pick<AppAccessAccount, 'staffType' | 'appType'>): boolean {
  return !!account.staffType.trim() || account.appType.some((type) => STAFF_APP_TYPES.includes(type));
}

export function appsOf(account: AppAccessAccount): AppSet {
  return {
    driver: account.appType.includes('driver'),
    manager: account.appType.includes('manager'),
    staff: isStaffTagged(account),
  };
}

/* ---- who may change what ------------------------------------------------------- */

export type Actor = {
  role: StaffRole;
  selfId: string | undefined;
  /** A staff account's region, or '' for an admin. */
  pinnedRegion: string;
};

/**
 * Why the account can't be opened here at all, or null. Answered like the Customers screen:
 * an account outside a staff member's region, or a staff account they may not touch, is
 * "not found" — "not yours" would confirm it exists.
 */
export type AccountBlock = 'notFound' | 'self';

export function accountBlockOf(account: AppAccessAccount | null, actor: Actor): AccountBlock | null {
  if (!account) return 'notFound';
  if (actor.selfId && account.objectId === actor.selfId) return 'self';
  if (actor.pinnedRegion && account.regionId !== actor.pinnedRegion) return 'notFound';
  if (isStaffTagged(account) && actor.role !== 'admin') return 'notFound';
  return null;
}

/** Why one box can't be changed, or null. */
export type AppLock = 'restaurant' | 'adminOnly';

export function appLockOf(app: GrantableApp, account: AppAccessAccount, actor: Actor): AppLock | null {
  if (app === 'manager' && account.managerStore && appsOf(account).manager) return 'restaurant';
  if (app === 'staff' && actor.role !== 'admin') return 'adminOnly';
  return null;
}

/* ---- the form ------------------------------------------------------------------ */

export type AppAccessDraft = AppSet & {
  /** Only when granting Staff: give Switch Ops access straight after. */
  opsAccess: boolean;
  /** Only asked for when the account has none — `editUser` refuses without it. */
  phone: string;
  regionId: string;
};

export function draftFromAccount(account: AppAccessAccount): AppAccessDraft {
  return { ...appsOf(account), opsAccess: true, phone: account.phone, regionId: account.regionId };
}

export type AccessChange = {
  granted: GrantableApp[];
  revoked: GrantableApp[];
};

export function changeOf(account: AppAccessAccount, draft: AppSet): AccessChange {
  const before = appsOf(account);
  const apps: GrantableApp[] = ['driver', 'manager', 'staff'];
  return {
    granted: apps.filter((app) => draft[app] && !before[app]),
    revoked: apps.filter((app) => !draft[app] && before[app]),
  };
}

export function isEmptyChange(change: AccessChange): boolean {
  return change.granted.length === 0 && change.revoked.length === 0;
}

/**
 * The `appType` to write: every entry the boxes don't govern kept as it is ('food', and any
 * value some app wrote that this console doesn't know), then the boxes. A staff account that
 * stays staff keeps its own spelling ('staff' or 'admin'); one being taken off the team loses
 * both, which is what `removeStaff` leaves behind too.
 */
export function nextAppType(account: AppAccessAccount, draft: AppSet): string[] {
  const governed = new Set<string>(['driver', 'manager', ...STAFF_APP_TYPES]);
  const next = account.appType.filter((type) => !governed.has(type));
  if (draft.driver) next.push('driver');
  if (draft.manager) next.push('manager');
  if (draft.staff) {
    const staffEntries = account.appType.filter((type) => STAFF_APP_TYPES.includes(type));
    next.push(...(staffEntries.length > 0 ? staffEntries : ['staff']));
  }
  return next;
}

export type AppAccessField = 'phone' | 'region' | 'profile';

export type EditUserParams = {
  id: string;
  fullname: string;
  email: string;
  phone: string;
  appType: string[];
  cityId: string;
  staffType?: string;
};

export type AppAccessPlan = {
  change: AccessChange;
  /** `editUser`, when a box other than taking Staff away changed. */
  edit: EditUserParams | null;
  /** `removeStaff` first, when Staff was unticked. */
  removeStaff: boolean;
  /** `setOpsAccess` after, when Staff was granted with the Ops box ticked. */
  grantOps: boolean;
};

export type AppAccessValidation = { ok: false; field: AppAccessField } | { ok: true; plan: AppAccessPlan };

/** `staffType` written for a new staff member — the dashboard's default role. */
export const NEW_STAFF_TYPE = 'Staff';

export function planAppAccess(account: AppAccessAccount, draft: AppAccessDraft): AppAccessValidation {
  const change = changeOf(account, draft);
  const removeStaff = change.revoked.includes('staff');
  const needsEdit = change.granted.length > 0 || change.revoked.some((app) => app !== 'staff');

  if (!needsEdit) {
    return { ok: true, plan: { change, edit: null, removeStaff, grantOps: false } };
  }

  // `editUser` rewrites the profile with what it is sent, and refuses without these. The
  // dialog can supply a missing phone or region; a name or email is the edit form's.
  if (!account.fullname.trim() || !account.email.trim()) return { ok: false, field: 'profile' };
  if (!isValidPhone(draft.phone)) return { ok: false, field: 'phone' };
  if (!draft.regionId) return { ok: false, field: 'region' };

  const grantsStaff = change.granted.includes('staff');
  // Always the account's own `staffType` when it has one — `editUser` writes whatever it is
  // sent, and an omitted one is cleared on the legacy server. Never sent after `removeStaff`,
  // which has just unset it.
  const staffType = grantsStaff ? NEW_STAFF_TYPE : removeStaff ? undefined : account.staffType.trim() || undefined;

  return {
    ok: true,
    plan: {
      change,
      removeStaff,
      grantOps: grantsStaff && draft.opsAccess,
      edit: {
        id: account.objectId,
        fullname: account.fullname,
        email: account.email,
        phone: normalizePhone(draft.phone),
        appType: nextAppType(account, draft),
        cityId: draft.regionId,
        ...(staffType ? { staffType } : {}),
      },
    },
  };
}

/** Whether the account read now is the one the dialog was opened on — two consoles changing
 * the same account's apps must not silently undo each other. */
export function sameApps(a: AppAccessAccount, b: AppAccessAccount): boolean {
  const key = (account: AppAccessAccount) =>
    JSON.stringify([[...account.appType].sort(), account.staffType.trim().toLowerCase(), account.managerStore?.objectId ?? '']);
  return key(a) === key(b);
}
