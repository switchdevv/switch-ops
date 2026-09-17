import type { MessageKey } from '@/lib/i18n/dictionary';
import type { MessageSender, SupportMessage } from '@/types/message';

/**
 * Rules for the support inbox — who wrote a message, from which of the platform's apps, and
 * what it is about — kept free of React and of the Parse SDK.
 */

/**
 * The apps with a Support screen that saves a `Message`: switch-food, switch-driver and
 * switch-manager. Their `APP_TYPE` constants are what each writes into `_User.appType` on
 * login, and what `sendPush` takes to pick the app's push token.
 */
export const SENDER_APPS = ['food', 'driver', 'manager'] as const;

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
 * *could* have come from, in `SENDER_APPS` order.
 */
export function senderApps(sender: Pick<MessageSender, 'appType'> | null): SenderApp[] {
  const types = sender?.appType ?? [];
  return SENDER_APPS.filter((app) => types.includes(app));
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

/** The limits of a push reply. FCM itself allows more, but a notification is read on a lock
 * screen, where anything past a few lines is cut. */
export const REPLY_TITLE_MAX = 60;
export const REPLY_BODY_MAX = 300;

export type ReplyValidation =
  | { ok: true; title: string; body: string }
  | { ok: false; field: 'title' | 'body' };

export function validateReply(title: string, body: string): ReplyValidation {
  const cleanTitle = title.trim();
  const cleanBody = body.trim();
  if (!cleanTitle || cleanTitle.length > REPLY_TITLE_MAX) return { ok: false, field: 'title' };
  if (!cleanBody || cleanBody.length > REPLY_BODY_MAX) return { ok: false, field: 'body' };
  return { ok: true, title: cleanTitle, body: cleanBody };
}

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
