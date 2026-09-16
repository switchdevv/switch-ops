import { isValidEmail, isValidPassword, isValidPhone, normalizePhone } from '@/lib/ops/driver-form';
import type { CustomerAccount } from '@/types/customer';

/**
 * The customer form's rules, free of React and Parse.
 *
 * The phone, email and password rules are the driver form's (lib/ops/driver-form.ts) and are
 * imported rather than copied: both forms write the same `_User` columns through the same
 * `addUser` / `editUser`, and the customer app stores phones in the same E.164 shape as the
 * driver app.
 *
 * Required fields are the platform's: `addUser` refuses without `fullname, username,
 * password, email, cityId`, and `editUser` without `id, fullname, email, phone, appType,
 * cityId` (switch-server cloud/dashboard/users.js). A phone is required when adding too, so
 * an account made here can be edited later.
 */

export type CustomerFormMode = 'add' | 'edit';

export type CustomerDraft = {
  fullname: string;
  /** Only used when adding: `editUser` cannot change a username. */
  username: string;
  password: string;
  email: string;
  phone: string;
  regionId: string;
};

export type CustomerField = 'fullname' | 'username' | 'password' | 'email' | 'phone' | 'region';

/** The values a validated draft writes — normalised, not as typed. */
export type CustomerParams = {
  fullname: string;
  username: string;
  password: string;
  email: string;
  phone: string;
  cityId: string;
};

export type CustomerValidation = { ok: false; field: CustomerField } | { ok: true; params: CustomerParams };

export function emptyCustomerDraft(regionId: string): CustomerDraft {
  return { fullname: '', username: '', password: '', email: '', phone: '', regionId };
}

export function draftFromCustomer(account: CustomerAccount): CustomerDraft {
  return {
    fullname: account.fullname ?? '',
    username: account.username ?? '',
    // Never prefilled: a password sent to `editUser` signs them out everywhere, which is
    // the reset dialog's job, not an edit's.
    password: '',
    email: account.email ?? '',
    phone: account.phone ?? '',
    regionId: account.regionId,
  };
}

/** The first problem with a draft, or the values to write. One field at a time, as the
 * driver form does, because the field named is the one to focus. */
export function validateCustomerDraft(draft: CustomerDraft, mode: CustomerFormMode): CustomerValidation {
  const fullname = draft.fullname.trim();
  const username = draft.username.trim();
  const email = draft.email.trim();

  if (!fullname) return { ok: false, field: 'fullname' };
  if (mode === 'add' && !username) return { ok: false, field: 'username' };
  if (mode === 'add' && !isValidPassword(draft.password)) return { ok: false, field: 'password' };
  if (!isValidEmail(email)) return { ok: false, field: 'email' };
  if (!isValidPhone(draft.phone)) return { ok: false, field: 'phone' };
  if (!draft.regionId) return { ok: false, field: 'region' };

  return {
    ok: true,
    params: { fullname, username, password: draft.password, email, phone: normalizePhone(draft.phone), cityId: draft.regionId },
  };
}
