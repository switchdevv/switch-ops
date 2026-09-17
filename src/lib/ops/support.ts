import type { MessageKey } from '@/lib/i18n/dictionary';
import type { MessageSender, SupportMessage } from '@/types/message';

/**
 * Rules for the support inbox — who wrote a message, from which of the platform's apps, and
 * what it is about — kept free of React and of the Parse SDK.
 */

/**
 * The apps with a Support screen that saves a `Message`: switch-driver, switch-manager and
 * switch-food. Their `APP_TYPE` constants are what each writes into `_User.appType` on
 * login, and what `sendPush` takes to pick the app's push token.
 *
 * Listed work apps first, and that order is the one thing about this inbox that is not
 * alphabetical by accident. An account holds every app it has signed into, so a driver who
 * has also ordered dinner carries both 'driver' and 'food' — and on this platform support
 * is how ops and drivers talk while a delivery is running ("the total is 1600", "he added
 * a dish"), so a driver writes as a driver and only rarely as a customer. Taking the first
 * app in this order as the one they wrote from is what makes the inbox label them Driver,
 * show their deliveries under the message, and answer into the driver app by default.
 */
export const SENDER_APPS = ['driver', 'manager', 'food'] as const;

export type SenderApp = (typeof SENDER_APPS)[number];

export const SENDER_APP_LABEL_KEY: Record<SenderApp, MessageKey> = {
  food: 'support.apps.food',
  driver: 'support.apps.driver',
  manager: 'support.apps.manager',
};

/** The account behind a message, or null when the include came back as a bare pointer —
 * the account was deleted, or this session can't read it. */
export function senderOf(message: Pick<SupportMessage, 'user'>): MessageSender | null {
  const user = message.user;
  if (!user || '__type' in user) return null;
  return user;
}

/**
 * Which of the three apps the sender has signed into.
 *
 * A message doesn't record the app it was written in, and one account can hold several —
 * a driver who also orders food carries both 'driver' and 'food' — so this is every app it
 * *could* have come from, in `SENDER_APPS` order: the likeliest first.
 */
export function senderApps(sender: Pick<MessageSender, 'appType'> | null): SenderApp[] {
  const types = sender?.appType ?? [];
  return SENDER_APPS.filter((app) => types.includes(app));
}

/** The app a message is read as coming from — the first of `senderApps` — or null for an
 * account with none of the three (or none that can be read). */
export function senderAppOf(sender: Pick<MessageSender, 'appType'> | null): SenderApp | null {
  return senderApps(sender)[0] ?? null;
}

/** Whether this message is a driver's, which is what the reader shows deliveries for. */
export function isDriverMessage(sender: Pick<MessageSender, 'appType'> | null): boolean {
  return senderAppOf(sender) === 'driver';
}

/**
 * switch-food's Settings sends people to Support with this text already typed when they ask
 * to delete their account (settings.deleteAccountMsg in src/localization/langs/*.json), in
 * the language the app was in. Matched after trimming and ignoring case, and as a prefix, so
 * a request someone added a line to is still recognised.
 */
const DELETION_REQUEST_TEXTS = [
  'I want to delete my account data from your servers',
  'Je souhaite supprimer les données de mon compte de vos serveurs',
  'أريد حذف بيانات حسابي من خوادمكم',
].map(normalise);

function normalise(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function isDeletionRequest(text: string | undefined): boolean {
  if (!text) return false;
  const value = normalise(text);
  return DELETION_REQUEST_TEXTS.some((request) => value.startsWith(request));
}

/** How much of a message a list row shows before cutting it. The row clamps to two lines
 * anyway; this just keeps a very long message from being laid out in full to be hidden. */
export const PREVIEW_CHARS = 240;

/** How much of it an alert shows. Far less: a toast and a system notification are read at
 * a glance, and neither clamps — one long message would fill the screen corner. */
export const ALERT_PREVIEW_CHARS = 90;

export function previewOf(text: string | undefined, max = PREVIEW_CHARS): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}

/** The limit of a push reply. FCM itself allows more, but a notification is read on a lock
 * screen, where anything past a few lines is cut. */
export const REPLY_BODY_MAX = 300;

export type ReplyValidation = { ok: true; body: string } | { ok: false };

export function validateReply(body: string): ReplyValidation {
  const clean = body.trim();
  if (!clean || clean.length > REPLY_BODY_MAX) return { ok: false };
  return { ok: true, body: clean };
}

/**
 * The words around a reply that ops don't type, in the language the sender's app is in.
 *
 * Not in lib/i18n: those dictionaries are this console's own UI, typed off `en.ts` and
 * shipping en + fr (see lib/i18n/locales.ts). This text is read on a phone, in *their*
 * language — as likely to be Arabic as anything else. Same reasoning, and the same shape,
 * as the driver pushes in lib/services/notify.ts; the platform's own pushes do it too
 * (switch-server cloud/localization/translations.json).
 *
 * - `title` heads the card each app shows for a push.
 * - `button` is what turns that card into a conversation: with `screen` beside it, all
 *   three apps' `showMessage` give the card a button, and this one opens their own Support
 *   screen — where the answer comes back as the next `Message`.
 * - `quickReplies` are the answers ops send twenty times an evening. Pressing one *fills
 *   the box* rather than sending, so what goes out is always what was on screen. Drivers
 *   and customers get their own set from `QUICK_REPLIES_BY_APP` instead.
 */
export type ReplyCopy = { title: string; button: string; quickReplies: readonly string[] };

const REPLY_COPY: Record<'en' | 'fr' | 'ar', ReplyCopy> = {
  en: {
    title: 'Switch support',
    button: 'Reply',
    quickReplies: ['Done ✅', 'OK 👍', 'Please call us 📞'],
  },
  fr: {
    title: 'Support Switch',
    button: 'Répondre',
    quickReplies: ["C'est fait ✅", 'OK 👍', 'Appelez-nous svp 📞'],
  },
  ar: {
    title: 'دعم Switch',
    button: 'رد',
    quickReplies: ['تم ✅', 'حسنا 👍', 'اتصل بنا من فضلك 📞'],
  },
};

/**
 * The quick answers for a reply going to the driver or customer app, whatever language
 * that app is in: ops write to them in Darja, the way these calls actually go. The
 * restaurant app keeps its language's `quickReplies`.
 */
export const QUICK_REPLIES_BY_APP: Partial<Record<SenderApp, readonly string[]>> = {
  driver: ['عيطلي، ما حكمتكش', 'ماهيش تصونيلك', 'راك مديكونكتي'],
  food: ['من فضلك، الليفرار وصل وما حكمكش، إتصل بنا', 'من فضلك، تيليفونك مغلق، إتصل بنا'],
};

export function quickRepliesFor(app: SenderApp, language: string | undefined): readonly string[] {
  return QUICK_REPLIES_BY_APP[app] ?? replyCopyFor(language).quickReplies;
}

/** `_User.language` as the apps write it — a row may carry 'ar-DZ', which normalises to
 * 'ar', and an account that has never opened Settings may carry nothing at all. */
export function replyCopyFor(language: string | undefined): ReplyCopy {
  const tag = (language ?? '').slice(0, 2).toLowerCase();
  return tag === 'fr' || tag === 'ar' ? REPLY_COPY[tag] : REPLY_COPY.en;
}

/**
 * How far back a delivery is still described by the gap to the message ("18 min before")
 * rather than by its own date.
 *
 * Twelve hours is a shift: past it, "14 h before" says nothing a dispatcher can use, and
 * the day and the time do.
 */
export const RELATIVE_GAP_MAX_MS = 12 * 60 * 60 * 1000;

/**
 * Which messages an account has opened on this browser — see hooks/use-support-read-marks.ts
 * for why that is local. Everything created before `since` counts as read; `ids` are the
 * newer ones opened since. `since` 0 means not known yet, when nothing is unread.
 */
export type ReadMarks = { since: number; ids: readonly string[] };

export function isUnread(marks: ReadMarks, message: { objectId: string; createdAt: string }): boolean {
  if (marks.since === 0) return false;
  return new Date(message.createdAt).getTime() > marks.since && !marks.ids.includes(message.objectId);
}

/* ---- alerts ---------------------------------------------------------------------- */

/**
 * Rules for the alerts the console raises when a message arrives — see
 * components/support-alerts.tsx for the runner that applies them.
 */

/** How often the console looks for new messages. The inbox's own pace
 * (`SUPPORT_INTERVAL_MS`): a support message is answered in minutes, not seconds. */
export const SUPPORT_ALERT_TICK_MS = 30_000;

/** A look still running after this is abandoned on the next beat. Parse 8 fetches have no
 * timeout of their own, and a look that never returns would stop every later one. */
export const SUPPORT_ALERT_TIMEOUT_MS = 20_000;

/** How many new messages one look takes. A burst longer than this is read over the
 * following beats, as the cursor advances. */
export const NEW_MESSAGES_LIMIT = 50;

/**
 * How stale a saved cursor may be before it is thrown away rather than caught up on.
 *
 * Past this, the console was closed rather than merely reloading or handing the look
 * between tabs, and the messages missed in the meantime belong in the bell's count — not
 * in a burst of notifications for things that happened while nobody was watching.
 */
export const ALERT_CURSOR_MAX_AGE_MS = 10 * 60 * 1000;

/** How often the bell's count re-reads on its own, beyond the arrivals the runner reports:
 * slow, because it exists only to notice deletions and messages read in another browser. */
export const SUPPORT_BELL_REFRESH_MS = 5 * 60 * 1000;

/** How many unread messages the bell lists before it stops and offers the inbox. */
export const BELL_LIST_SIZE = 8;

/**
 * Where the console has read up to.
 *
 * `at` is the newest `createdAt` it has seen, in epoch ms, and `ids` are the messages at
 * exactly that moment. The next look asks for everything at or after `at` and throws those
 * ids away, which is what makes two messages saved in the same millisecond safe: asking for
 * *after* `at` would silently drop the second one.
 *
 * Only server timestamps are ever compared. A PC whose clock is minutes off would otherwise
 * hide every message written inside that gap.
 */
export type AlertCursor = { at: number; ids: readonly string[] };

/** Where a cursor stands after a look, given the rows it returned (any order). */
export function advanceCursor(cursor: AlertCursor, rows: SupportMessage[]): AlertCursor {
  let at = cursor.at;
  for (const row of rows) {
    const time = new Date(row.createdAt).getTime();
    if (Number.isFinite(time) && time > at) at = time;
  }
  if (at === cursor.at && rows.length === 0) return cursor;

  const ids = rows
    .filter((row) => new Date(row.createdAt).getTime() === at)
    .map((row) => row.objectId);
  // The moment didn't move, so the ids already parked there are still in the way.
  return { at, ids: at === cursor.at ? [...new Set([...cursor.ids, ...ids])] : ids };
}

/**
 * Whether a message is one this account is meant to see — the inbox's region rule, applied
 * to a row already in hand rather than sent to the server as `senderParams`' `matchesQuery`.
 *
 * `pinnedRegion` is `''` for an admin, who sees every region here, as in the inbox. A staff
 * account sees its own, and a message whose sender came back as a bare pointer (the account
 * is gone, or can't be read) belongs to no region, so it is left to admins.
 */
export function isInScope(message: Pick<SupportMessage, 'user'>, pinnedRegion: string): boolean {
  if (!pinnedRegion) return true;
  return senderOf(message)?.city?.objectId === pinnedRegion;
}
