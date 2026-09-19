import { runFunction } from '@/lib/parse/cloud';
import { MESSAGE_NOT_FOUND, SENDER_GONE } from '@/lib/parse/errors';
import { find, findOne, findWithCount, pointer, type PageResult, type QueryParam } from '@/lib/parse/query';
import {
  NEW_MESSAGES_LIMIT,
  replyCopyFor,
  senderOf,
  type AlertCursor,
  type ReadMarks,
  type SenderApp,
} from '@/lib/ops/support';
import type { SupportFilters } from '@/lib/url/support-filters';
import type { MessageSender, SupportMessage } from '@/types/message';
import type { OrderRow } from '@/types/order';

const MESSAGE = 'Message';
const USER = '_User';

/**
 * The support inbox — the `Message` rows switch-food, switch-driver and switch-manager save
 * from their Support screens, read the way switch-dashboard's Support page reads them
 * (src/pages/Support/Support.jsx), and removed through the same `deleteMessages` function.
 *
 * Two things the dashboard didn't have, and what they rest on:
 *
 * - **Regions.** A message has no region column. The server's own `afterSave` on `Message`
 *   (switch-server cloud/message/message.js) notifies the staff of the *sender's* `city`, so
 *   that is the region a message belongs to here too, matched through the `user` pointer.
 *   A sender with no region is only seen by admins — the same people the server notifies.
 * - **Replies.** `sendPush` to the sender's account, which all three apps show as a card
 *   with the title and the text (their Home screens' `showMessage`) — and, since ops and
 *   drivers use this inbox to talk while a delivery runs, with a button that opens the
 *   app's own Support screen so the answer comes straight back (see `replyToMessage`).
 * - **A driver's deliveries.** Support is where a driver says what an order really came to,
 *   so a driver's message is read beside the orders they were carrying when they wrote it
 *   (see `listSenderDeliveries`).
 *
 * `deleteMessages` and `sendPush` check a role and nothing else — no region — so a staff
 * account is confined here, before each call, by re-reading the message within its region.
 */

export const SUPPORT_PAGE_SIZE = 20;

/** The sender's columns the inbox shows. The include returns the whole `_User` row — push
 * tokens, cart, auth data — so it is narrowed to these straight away, at the boundary, and
 * nothing else reaches the cache. */
function narrowSender(user: Record<string, unknown>): MessageSender {
  const pick = <T,>(key: string, guard: (value: unknown) => boolean) =>
    guard(user[key]) ? (user[key] as T) : undefined;
  const isString = (value: unknown) => typeof value === 'string';
  const isPointer = (value: unknown) => !!value && typeof value === 'object' && 'objectId' in value;
  return {
    objectId: String(user.objectId),
    createdAt: String(user.createdAt ?? ''),
    updatedAt: String(user.updatedAt ?? ''),
    fullname: pick('fullname', isString),
    username: pick('username', isString),
    phone: pick('phone', isString),
    appType: Array.isArray(user.appType)
      ? user.appType.filter((type): type is string => typeof type === 'string')
      : undefined,
    staffType: pick('staffType', isString),
    enabled: pick('enabled', (value) => typeof value === 'boolean'),
    city: pick('city', isPointer),
    managerStore: pick('managerStore', isPointer),
    language: pick('language', isString),
  };
}

function narrow(message: SupportMessage): SupportMessage {
  const user = message.user as unknown as Record<string, unknown> | undefined;
  if (!user || user.__type === 'Pointer') return message;
  return { ...message, user: narrowSender(user) };
}

/** The sender's region and app, as one constraint on `user` — Parse keeps only the last
 * `matchesQuery` on a key, so the two can't be separate params. */
function senderParams(region: string, app: SenderApp | ''): QueryParam {
  if (!region && !app) return {};
  return {
    matchesQuery: {
      key: 'user',
      className: USER,
      params: [
        region ? { equalTo: { key: 'city', value: pointer('City', region) } } : {},
        // An equality against an array column matches rows whose array contains it.
        app ? { equalTo: { key: 'appType', value: app } } : {},
      ],
    },
  };
}

function scopeParams(filters: SupportFilters): QueryParam[] {
  const { query, field, region, app, range } = filters;
  return [
    // Names, emails and text match anywhere, ignoring case; a phone anywhere in the field.
    // The regex is escaped in lib/parse/query.ts.
    query && (field === 'fullname' || field === 'email' || field === 'message')
      ? { matches: { key: field, value: query, modifiers: 'i' } }
      : {},
    query && field === 'phone' ? { matches: { key: 'phone', value: query } } : {},
    query && field === 'objectId' ? { startsWith: { key: 'objectId', value: query } } : {},
    query && field === 'user' ? { equalTo: { key: 'user', value: pointer(USER, query) } } : {},
    senderParams(region, app),
    range.start ? { greaterThanOrEqualTo: { key: 'createdAt', value: range.start } } : {},
    range.end ? { lessThanOrEqualTo: { key: 'createdAt', value: range.end } } : {},
  ];
}

/**
 * What "unread" means as a query: newer than the moment everything before was read, and not
 * one of the ids opened since. `$gt` sits beside the period's `$gte`/`$lte` on `createdAt` —
 * different operators on one key are merged by the SDK, not overwritten.
 */
function unreadParams(marks: ReadMarks): QueryParam[] {
  return [
    { greaterThan: { key: 'createdAt', value: new Date(marks.since) } },
    marks.ids.length > 0 ? { notContainedIn: { key: 'objectId', value: [...marks.ids] } } : {},
  ];
}

/** One page of the inbox, newest first. `marks` narrows it to unread when the filter asks. */
export async function listMessages(
  filters: SupportFilters,
  page: number,
  marks: ReadMarks | null,
): Promise<PageResult<SupportMessage>> {
  const result = await findWithCount<SupportMessage>(MESSAGE, [
    ...scopeParams(filters),
    ...(filters.unread && marks ? unreadParams(marks) : []),
    { include: 'user' },
    { descending: 'createdAt' },
    { limit: SUPPORT_PAGE_SIZE },
    { skip: (page - 1) * SUPPORT_PAGE_SIZE },
  ]);
  return { count: result.count, results: result.results.map(narrow) };
}

/** How many unread ids come back with the count — enough to cover every message someone
 * opens before the next read, far more than the bell's "99+" ever shows. */
export const UNREAD_IDS_LIMIT = 500;

export type UnreadSnapshot = {
  /** Unread messages in the current search, region, app and period, as the server counted
   * them with the read marks of the moment. */
  count: number;
  /** The newest of them, by id — so a message opened afterwards can be taken off the count
   * in the browser (see `useSupportUnreadCount`) without asking the server again. */
  ids: string[];
};

/**
 * The number on the Unread tab and on the bell, with the ids behind it.
 *
 * Ids rather than a bare count because opening a message used to change this query's key
 * and send it again — and for a staff account it carries the region sub-query, which on
 * Parse 4.3 loads every account of the region into the server. Now the key moves only with
 * `marks.since`, and each message opened is subtracted locally.
 */
export async function listUnread(filters: SupportFilters, marks: ReadMarks): Promise<UnreadSnapshot> {
  const page = await findWithCount<{ objectId: string }>(MESSAGE, [
    ...scopeParams(filters),
    ...unreadParams(marks),
    { select: ['objectId'] },
    { descending: 'createdAt' },
    { limit: UNREAD_IDS_LIMIT },
  ]);
  return { count: page.count, ids: page.results.map((row) => row.objectId) };
}

/** What the unread number is now, given the marks as they are. A message opened since the
 * server counted is taken off when it was among the ids the server returned. */
export function unreadNow(snapshot: UnreadSnapshot, marks: ReadMarks): number {
  const opened = new Set(marks.ids);
  const readSince = snapshot.ids.reduce((total, id) => total + (opened.has(id) ? 1 : 0), 0);
  return Math.max(0, snapshot.count - readSince);
}

/** One message — or null when there is none, or it belongs to a region outside
 * `pinnedRegion`. The two are answered alike, as a restaurant or a driver is. */
export async function getMessage(id: string, pinnedRegion: string): Promise<SupportMessage | null> {
  const row = await findOne<SupportMessage>(MESSAGE, [
    { equalTo: { key: 'objectId', value: id } },
    senderParams(pinnedRegion, ''),
    { include: 'user' },
  ]);
  return row ? narrow(row) : null;
}

/* ---- alerts -------------------------------------------------------------------- */

/**
 * Where the inbox stands right now, as a cursor to look forward from.
 *
 * Read once, when a browser starts watching for the first time: everything already in the
 * inbox is backlog, which belongs in the bell's count rather than in a burst of
 * notifications. `{ at: 0 }` when there are no messages at all — then the first message
 * ever written is an arrival, which is right.
 */
export async function newestMessageCursor(): Promise<AlertCursor> {
  const row = await findOne<SupportMessage>(MESSAGE, [
    { select: ['createdAt'] },
    { descending: 'createdAt' },
  ]);
  if (!row) return { at: 0, ids: [] };
  return { at: new Date(row.createdAt).getTime(), ids: [row.objectId] };
}

/**
 * The messages saved since the cursor, oldest first — the whole platform's, not just this
 * account's region.
 *
 * Deliberately **not** narrowed to a region by the server. `senderParams` would send a
 * `matchesQuery` over `_User`, which has no `city` index, and this runs every thirty
 * seconds in every open console; the caller sorts the handful of rows by `isInScope`
 * instead. The `Message` class is readable by any Staff session anyway — the region is a
 * rule about whose work a message is, not a permission.
 */
export async function listMessagesSince(cursor: AlertCursor): Promise<SupportMessage[]> {
  const rows = await find<SupportMessage>(MESSAGE, [
    { greaterThanOrEqualTo: { key: 'createdAt', value: new Date(cursor.at) } },
    // The rows already seen at exactly `cursor.at` — see `AlertCursor`.
    cursor.ids.length > 0 ? { notContainedIn: { key: 'objectId', value: [...cursor.ids] } } : {},
    { include: 'user' },
    // Oldest first: a burst longer than the limit is then read in order over the next
    // beats, instead of the oldest of it never arriving.
    { ascending: 'createdAt' },
    { limit: NEW_MESSAGES_LIMIT },
  ]);
  return rows.map(narrow);
}

/** Everything else this account has written to support, newest first. */
export const HISTORY_LIMIT = 10;

export function listSenderMessages(userId: string, pinnedRegion: string): Promise<PageResult<SupportMessage>> {
  return findWithCount<SupportMessage>(MESSAGE, [
    { equalTo: { key: 'user', value: pointer(USER, userId) } },
    senderParams(pinnedRegion, ''),
    { select: ['fullname', 'message'] },
    { descending: 'createdAt' },
    { limit: HISTORY_LIMIT },
  ]);
}

/** The sender's latest orders as a customer, for context. A staff account sees only the
 * ones in its region, as on the board. */
export const RECENT_ORDERS_LIMIT = 5;

export function listSenderOrders(userId: string, pinnedRegion: string): Promise<PageResult<OrderRow>> {
  return findWithCount<OrderRow>('Order', [
    { equalTo: { key: 'user', value: pointer(USER, userId) } },
    pinnedRegion ? { equalTo: { key: 'city', value: pointer('City', pinnedRegion) } } : {},
    { include: 'restaurant' },
    { include: 'city' },
    { descending: 'createdAt' },
    { limit: RECENT_ORDERS_LIMIT },
  ]);
}

/**
 * The deliveries a driver was carrying around the time they wrote — the thing their
 * message is almost always about.
 *
 * **Anchored on the message, not on now.** A driver carries one order at a time and writes
 * about the one in hand, so what a dispatcher needs is the run of orders that led up to
 * those words — the same set whether the message is read a minute later or the next
 * morning. Newest first, so the first row is the one they were most likely on.
 *
 * `createdAt` is when the *customer placed* the order, which is the only time any of this
 * is stamped with: `Order` carries no accepted-at, collected-at or delivered-at column
 * (switch-server `_SCHEMA.json`), and `updatedAt` moves on every later edit, including the
 * one ops are about to make in answer to this message. So the console shows the gap and
 * lets the person reading decide, rather than claiming to know which order was in hand.
 *
 * The customer is included as well as the restaurant: a driver's "he added a dish" is
 * about a person ops may have to call.
 */
export const DELIVERIES_LIMIT = 5;

export function listSenderDeliveries(
  driverId: string,
  before: string,
  pinnedRegion: string,
): Promise<OrderRow[]> {
  return find<OrderRow>('Order', [
    { equalTo: { key: 'driver', value: pointer(USER, driverId) } },
    { lessThanOrEqualTo: { key: 'createdAt', value: new Date(before) } },
    pinnedRegion ? { equalTo: { key: 'city', value: pointer('City', pinnedRegion) } } : {},
    { include: 'restaurant' },
    { include: 'user' },
    { include: 'city' },
    { descending: 'createdAt' },
    { limit: DELIVERIES_LIMIT },
  ]);
}

/* ---- writes -------------------------------------------------------------------- */

/**
 * Deletes a message through `deleteMessages`.
 *
 * The function reads each id and destroys it without checking it found anything, so a
 * message someone else already deleted makes it throw a bare 141. It is re-read first, within
 * the account's region, and a missing one refused with a sentence that says what happened.
 */
export async function deleteMessage(id: string, pinnedRegion: string): Promise<void> {
  const message = await getMessage(id, pinnedRegion);
  if (!message) throw new Error(MESSAGE_NOT_FOUND);
  await runFunction('deleteMessages', { ids: [id] });
}

/**
 * Answers a message with a push to its sender's app, through `sendPush`.
 *
 * **The card carries a Reply button.** All three apps build the card for a push the same
 * way (`showMessage` in each app's Home screen): `data.button` gives it a button, and
 * `data.screen` is the route that button opens — here each app's own `Support`, whose form
 * saves the next `Message`. That is what makes this an exchange rather than a broadcast,
 * which is how ops and drivers use it while a delivery is running. The button's word and
 * the card's title come from `replyCopyFor`, in the language the sender's app is in; the
 * body is ops' own words, untouched.
 *
 * Deliberately no `newOrder`, `playSound`, `launchApp`, `id` or `cancel`: those belong to
 * the platform's order payloads, and in the driver app they would start the offer siren or
 * drop the delivery the driver is on (see lib/services/notify.ts). No `icon` either: the app
 * builds on phones crash on a name they don't know (see `messageDriver` in
 * lib/services/drivers.ts). Every `data` value is a string, because FCM takes no other type.
 *
 * The account is taken from the message as re-read, never from the screen. `sendPush` reads
 * `pushToken[app]` off a row that may have no `pushToken` at all — a TypeError on the server,
 * which comes back as a 141 — so that is told apart in `parseErrorKey`'s support branch.
 */
export async function replyToMessage(
  id: string,
  app: SenderApp,
  body: string,
  pinnedRegion: string,
): Promise<void> {
  const message = await getMessage(id, pinnedRegion);
  if (!message) throw new Error(MESSAGE_NOT_FOUND);
  const sender = senderOf(message);
  if (!sender) throw new Error(SENDER_GONE);
  const { title, button } = replyCopyFor(sender.language);
  await runFunction('sendPush', {
    title,
    body,
    userId: sender.objectId,
    appType: app,
    data: { title, body, screen: 'Support', button },
  });
}
