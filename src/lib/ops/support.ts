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

export function previewOf(text: string | undefined): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS)}…` : flat;
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
