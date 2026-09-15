import { runFunction } from '@/lib/parse/cloud';
import { find } from '@/lib/parse/query';
import type { SwitchUser } from '@/types/user';

const USER = '_User';

/**
 * The copy of the pushes this console sends drivers, per driver-app language.
 *
 * Not in lib/i18n: those dictionaries are this console's own UI, typed off `en.ts` and
 * shipping only en + fr (see lib/i18n/locales.ts). This text is read by a driver on a
 * phone, in *their* language — which is as likely to be Arabic as anything else.
 */
type Copy = Record<string, string>;

/** "One more order is lined up for you." */
const QUEUED_COPY: Record<string, { title: string; body: string; button: string }> = {
  en: {
    title: 'One more order lined up for you',
    body: 'It reaches you as soon as you finish the one you are on. Tap to see what is next.',
    button: 'See what is next',
  },
  fr: {
    title: 'Une commande de plus vous est réservée',
    body: "Elle vous parvient dès que vous terminez la course en cours. Touchez pour voir la suite.",
    button: 'Voir la suite',
  },
  ar: {
    title: 'تم حجز طلب آخر لك',
    body: 'يصلك بمجرد إنهاء الطلب الحالي. اضغط لرؤية التالي.',
    button: 'عرض التالي',
  },
};

/** "Ops took this order off you." `%s` is the order's `#objectId`, written in full the way
 * the driver app writes it on its own cards. */
const UNASSIGNED_COPY: Record<string, { title: string; body: string }> = {
  en: {
    title: 'Order %s was taken off you',
    body: "The operations team removed you from this delivery. You don't need to continue with it.",
  },
  fr: {
    title: 'La commande %s vous a été retirée',
    body: "L'équipe des opérations vous a retiré cette livraison. Vous n'avez plus à la poursuivre.",
  },
  ar: {
    title: 'تم سحب الطلب %s منك',
    body: 'قام فريق العمليات بسحب هذا التوصيل منك. لا داعي لمتابعته.',
  },
};

/** The driver app's own language codes | a row may carry 'ar-DZ', which normalises to 'ar'. */
function copyFor<T extends Copy>(table: Record<string, T>, language: string | undefined): T {
  const tag = (language ?? '').slice(0, 2).toLowerCase();
  return table[tag] ?? table.en;
}

async function driverLanguage(driverId: string): Promise<string | undefined> {
  const rows = await find<SwitchUser>(USER, [
    { equalTo: { key: 'objectId', value: driverId } },
    { select: ['language'] },
    { limit: 1 },
  ]);
  return rows[0]?.language;
}

/**
 * Tells a driver that ops put one more order behind the one they are on.
 *
 * Deliberately **not** the offer push. The platform's new-order payload carries
 * `newOrder`, `launchApp` and `playSound`, which in the driver app force the app
 * to the foreground, start the looping alert tone and open the accept card
 * (switch-driver/src/screens/Home/Home.js `showOrder`). A queued order is not
 * actionable yet, so none of those may be set: without `newOrder` the same payload
 * lands in `showMessage` instead, where `screen` + `button` turn it into a card with
 * a button that opens the driver's queue.
 *
 * Never throws. `sendPush` refuses a driver who never registered a token, and a push
 * nobody can deliver must not undo the queueing that earned it.
 */
export function notifyDriverQueued(driverId: string, orderId: string): void {
  void (async () => {
    try {
      const { title, body, button } = copyFor(QUEUED_COPY, await driverLanguage(driverId));
      await runFunction('sendPush', {
        title,
        body,
        userId: driverId,
        appType: 'driver',
        // Every value a string: the platform hands `data` straight to FCM, which takes no
        // other type. `screen` is the driver app's own route name for its queue.
        data: { screen: 'OrderQueue', id: orderId, queued: '1', button },
      });
    } catch {
      // A driver who does not get the heads-up still finds the order in their queue, and
      // still gets the real offer when the runner sends it.
    }
  })();
}

/**
 * Tells a driver that ops took an order off them, so their app lets go of it.
 *
 * The payload is the platform's own cancel push — `cancel` + `id`, the shape
 * `cancelManager` sends a driver when a restaurant cancels (switch-server
 * cloud/order/manager.js). The driver app's `showMessage` shows the text and calls
 * `hideOrder(id)` for any payload carrying `cancel`, which drops the card, clears the
 * stored current order and switches the driver back online — foregrounded, backgrounded,
 * or on the next launch within the app's ten-minute restore window
 * (switch-driver/src/push/index.js `MESSAGE_MAX_AGE`).
 *
 * Resolves to whether the push was handed to the server. That is the most this console
 * can know — `sendPush` doesn't wait for delivery — but a refusal (no push token, a
 * dropped connection) is certain: that driver's app still shows the order as theirs, and
 * someone has to call them. Never throws, because the unassign itself already happened.
 */
export async function notifyDriverUnassigned(driverId: string, orderId: string): Promise<boolean> {
  try {
    const copy = copyFor(UNASSIGNED_COPY, await driverLanguage(driverId));
    await runFunction('sendPush', {
      title: copy.title.replace('%s', `#${orderId}`),
      body: copy.body,
      userId: driverId,
      appType: 'driver',
      // No `newOrder`, `launchApp` or `playSound` — see `notifyDriverQueued`.
      data: { id: orderId, cancel: 'true', icon: 'error' },
    });
    return true;
  } catch {
    return false;
  }
}
