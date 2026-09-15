import type { MessageKey } from '@/lib/i18n/dictionary';

/**
 * Where the failing call came from — the same code means different things in each:
 * 101 is a wrong password at login and a missing/forbidden object on every read; 141 is
 * a rejected request generally, but at login it is specifically the `loginStaff` cloud
 * function not being deployed. Never map one code to one global message.
 *
 * `dispatch` is a write: assigning a driver from the live map. `queue` is the driver
 * queue — lining an order up behind a busy driver, and the runner that sends it later.
 * `order` is a change to the order itself: confirming it, editing its status and prices, or
 * taking its driver off it.
 */
export type ErrorContext = 'login' | 'fetch' | 'dispatch' | 'queue' | 'order';

/** Thrown by lib/services/queue.ts when an order is moved while a console is sending it. */
export const QUEUE_SENDING = 'QUEUE_SENDING';

/** Thrown before confirming, when a driver was chosen for an order that can't take one —
 * a pickup, or a delivery someone is already carrying. */
export const NO_DRIVER_FOR_ORDER = 'NO_DRIVER_FOR_ORDER';

/** Thrown before unassigning, when the order no longer has the driver ops asked to take
 * off — they cancelled, or someone else already moved it. */
export const DRIVER_CHANGED = 'DRIVER_CHANGED';

/** Thrown before unassigning an order that was delivered since the panel loaded. */
export const ORDER_DELIVERED = 'ORDER_DELIVERED';

/**
 * Maps whatever a Parse call threw to a dictionary key, not to a string.
 *
 * Returning a key rather than English is what keeps error copy translated: every
 * user-facing string in this console goes through `t()`, and an error path is exactly
 * where a hard-coded sentence would survive review unnoticed.
 */
export function parseErrorKey(error: unknown, context: ErrorContext): MessageKey {
  // `loginStaff` signals authorization failures by message, not by code — see
  // switch-dashboard/src/pages/Login/Login.jsx, which branches on these same two
  // strings. They are checked before the numeric codes because the code that
  // accompanies them is the generic 141.
  const message = getErrorMessage(error);
  if (message === 'USER_DOES_NOT_EXISTS') return 'errors.usernameUnknown';
  if (message === 'USER_UNAUTHORIZED') return 'errors.notStaff';

  // `assignDriver` refuses by message too, and these three are the refusals
  // switch-dashboard tells apart (src/pages/Orders/Orders.jsx `itemAction`). Each one
  // is the world having moved since the map last refreshed — not a failure to retry.
  if (context === 'dispatch') {
    if (message === 'DRIVER_DISCONNECTED') return 'errors.driverOffline';
    if (message === 'ORDER_CANCELED') return 'errors.orderCanceled';
    // Sic — the backend's spelling.
    if (message === 'ORDER_FULLFILLED') return 'errors.orderTaken';
  }

  // `acceptManager` uses the same two words, meaning something narrower: canceled, or no
  // longer at status 0 — accepted by the restaurant, most likely, since the panel loaded.
  if (context === 'order') {
    if (message === NO_DRIVER_FOR_ORDER) return 'errors.noDriverForOrder';
    if (message === DRIVER_CHANGED) return 'errors.driverChanged';
    if (message === ORDER_DELIVERED) return 'errors.orderDelivered';
    if (message === 'ORDER_CANCELED') return 'errors.orderCanceled';
    if (message === 'ORDER_FULLFILLED') return 'errors.alreadyConfirmed';
  }

  // `DispatchQueue` is this console's own class, so the server may not know it yet: with
  // client class creation off it refuses a class it has never seen ("non-existent
  // class"), and with `addField` locked, a column it hasn't got. Both are one-time setup
  // in the Parse Dashboard, not a permission a person lacks — and both come back as 119,
  // which would otherwise read as "you're not allowed".
  if (context === 'queue') {
    if (message === QUEUE_SENDING) return 'errors.queueSending';
    if (message?.includes('non-existent class') || message?.includes('addField')) {
      return 'errors.queueMissing';
    }
    const code = getErrorCode(error);
    // 101 on a write is Parse's answer to a row whose ACL leaves this account out.
    if (code === 101 || code === 119) return 'errors.queueForbidden';
  }

  switch (getErrorCode(error)) {
    case 100:
      return 'errors.network';
    case 101:
      return context === 'login' ? 'errors.badCredentials' : 'errors.missingOrForbidden';
    case 119:
      return context === 'login' ? 'errors.notStaff' : 'errors.forbidden';
    case 141:
      // 141 is also what Parse returns for a cloud function that isn't defined. At login
      // that is the only plausible cause, and naming it beats "the server rejected that
      // request", which reads as a bug in this app rather than a missing deployment.
      return context === 'login' ? 'errors.staffLoginMissing' : 'errors.rejected';
    case 209:
      return 'errors.sessionExpired';
    default:
      if (process.env.NODE_ENV !== 'production') {
        console.error(`[parse:${context}]`, error);
      }
      return 'errors.unknown';
  }
}

/**
 * Codes that mean "this session or account cannot do this" rather than "the network
 * hiccupped, try again" — used by the QueryClient's retry policy so a permission or
 * session failure surfaces immediately instead of after three identical retries
 * (see lib/query/client.ts).
 */
export function isAuthError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code === 101 || code === 119 || code === 209;
}

function getErrorCode(error: unknown): number | undefined {
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof (error as { code: unknown }).code === 'number'
  ) {
    return (error as { code: number }).code;
  }
  return undefined;
}

export function getErrorMessage(error: unknown): string | undefined {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return undefined;
}
