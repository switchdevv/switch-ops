import type { DriverAccount } from '@/types/driver';

/**
 * The driver form's rules, free of React and Parse: what a draft holds, what has to be in
 * it, and the values the cloud functions are given.
 *
 * The required fields are the platform's own, not this console's invention:
 * `addUser` refuses without `fullname, username, password, email, cityId, enabled`, and
 * `editUser` without `id, fullname, email, phone, appType, cityId` (switch-server
 * cloud/dashboard/users.js). Two are required here that the server would accept without:
 *
 * - **a phone**, because the driver app forces an account without one into its phone step
 *   at launch and no further (switch-driver navigation/root.js: `!user.phone ? <SetPhone/>`).
 * - **a region**, because the driver app refuses to work outside one — no GO button, "city
 *   not supported". `addUser` requires it anyway; `editUser` would too.
 *
 * A minimum password length is this console's own rule; the server has none.
 */

/** The country Switch operates in, as the driver app's phone step is configured
 * (switch-driver configs/index.js `defaultCountryCode = 'DZ'`). */
export const PHONE_DIALLING_CODE = '+213';

/** Shorter than any real number, and a typo nobody should be able to save onto an account
 * the platform then sends SMS to. */
export const MIN_PASSWORD_LENGTH = 6;

export type DriverFormMode = 'add' | 'edit';

export type DriverDraft = {
  fullname: string;
  /** Only used when adding: `editUser` cannot change a username. */
  username: string;
  password: string;
  email: string;
  phone: string;
  regionId: string;
};

export type DriverField = 'fullname' | 'username' | 'password' | 'email' | 'phone' | 'region';

/** The values a validated draft writes. Normalised, not as typed. */
export type DriverParams = {
  fullname: string;
  username: string;
  password: string;
  email: string;
  phone: string;
  cityId: string;
};

export type DriverValidation = { ok: false; field: DriverField } | { ok: true; params: DriverParams };

/* ---- phone --------------------------------------------------------------------- */

/**
 * A number in the shape the driver app stores.
 *
 * That app's phone step hands `react-native-phone-number-input`'s formatted text to
 * `putUser` after stripping spaces and collapsing the one mistake its own country picker
 * makes — a local `0` left in front of the dialling code
 * (switch-driver/src/screens/OtpCode/OtpCode.js: `.replace('+2130', '+213')`). So every
 * number the platform sends an SMS to is E.164: a `+`, then digits.
 *
 * Typing it the way an Algerian number is written down — `0550 12 34 56` — is therefore
 * accepted and converted, rather than saved as something the app would render differently
 * from every other driver's.
 */
export function normalizePhone(value: string): string {
  const compact = value.replace(/[\s.()‐-―-]/g, '');
  const withPlus = compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
  const international = withPlus.startsWith('0') ? `${PHONE_DIALLING_CODE}${withPlus.slice(1)}` : withPlus;
  // The same collapse the driver app makes, for a number pasted out of it or typed as
  // '+213 0550…'.
  return international.replace(/^\+2130/, PHONE_DIALLING_CODE);
}

/** E.164: a `+` and 8 to 15 digits. Deliberately not a per-country pattern — the column
 * holds whatever country the account was registered in, and this screen is not the place
 * to start refusing numbers the apps already accepted. */
export function isValidPhone(value: string): boolean {
  return /^\+\d{8,15}$/.test(normalizePhone(value));
}

/* ---- email --------------------------------------------------------------------- */

/**
 * The shape of an address, not its existence. Parse does its own check on the way in and
 * answers 125 for one it refuses, which `parseErrorKey` turns into words — this only stops
 * the obvious slip before a round-trip.
 */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/* ---- drafts -------------------------------------------------------------------- */

export function emptyDriverDraft(regionId: string): DriverDraft {
  return { fullname: '', username: '', password: '', email: '', phone: '', regionId };
}

export function draftFromAccount(account: DriverAccount): DriverDraft {
  return {
    fullname: account.fullname ?? '',
    username: account.username ?? '',
    // Never prefilled, and never sent unless it was typed: an `editUser` carrying a
    // password revokes every one of that driver's sessions.
    password: '',
    email: account.email ?? '',
    phone: account.phone ?? '',
    regionId: account.regionId,
  };
}

/**
 * The first problem with a draft, or the values to write.
 *
 * One field at a time rather than a list, because this form is six inputs in a dialog: the
 * field named is the one to focus, and by the time the second is reached the first has
 * been fixed. (The restaurant form returns every problem at once — it is a page of forty
 * controls, where a list is the only way to see what is left.)
 */
export function validateDriverDraft(draft: DriverDraft, mode: DriverFormMode): DriverValidation {
  const fullname = draft.fullname.trim();
  const username = draft.username.trim();
  const email = draft.email.trim();
  const phone = normalizePhone(draft.phone);

  if (!fullname) return { ok: false, field: 'fullname' };
  if (mode === 'add' && !username) return { ok: false, field: 'username' };
  if (mode === 'add' && !isValidPassword(draft.password)) return { ok: false, field: 'password' };
  if (!isValidEmail(email)) return { ok: false, field: 'email' };
  if (!isValidPhone(draft.phone)) return { ok: false, field: 'phone' };
  if (!draft.regionId) return { ok: false, field: 'region' };

  return {
    ok: true,
    params: { fullname, username, password: draft.password, email, phone, cityId: draft.regionId },
  };
}

export function isValidPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

/** The new-password form: long enough, and typed the same way twice. Separate from the
 * draft rules because resetting a password is its own dialog and changes nothing else. */
export function validateNewPassword(
  password: string,
  confirmation: string,
): { ok: false; field: 'password' | 'confirmation' } | { ok: true; password: string } {
  if (!isValidPassword(password)) return { ok: false, field: 'password' };
  if (password !== confirmation) return { ok: false, field: 'confirmation' };
  return { ok: true, password };
}

/* ---- the message dialog --------------------------------------------------------- */

/** How much of a push a phone shows before it truncates, roughly — and as much as anyone
 * should type into a notification a driver reads at a traffic light. */
export const MESSAGE_TITLE_MAX = 60;
export const MESSAGE_BODY_MAX = 240;

export function validateMessage(
  title: string,
  body: string,
): { ok: false; field: 'title' | 'body' } | { ok: true; title: string; body: string } {
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  if (!trimmedTitle) return { ok: false, field: 'title' };
  if (!trimmedBody) return { ok: false, field: 'body' };
  return { ok: true, title: trimmedTitle, body: trimmedBody };
}
