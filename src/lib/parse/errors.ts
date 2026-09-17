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
 * taking its driver off it. `cancel` is cancelling an order. `catalogue` is a change to a restaurant, a menu or a dish.
 * `drivers` is a change to a driver account: adding, editing, activating or deactivating
 * one, resetting its password, or sending it a message. `customers` is the same for a
 * customer account, plus deleting one. `managers` is the same for a manager account, plus
 * giving it a restaurant or taking it off one. `access` is an admin granting or revoking a
 * staff account's Ops access on /access. `calls` is marking the customer or restaurant
 * call on an order, or taking a mark back.
 */
export type ErrorContext = 'login' | 'fetch' | 'dispatch' | 'queue' | 'order' | 'cancel' | 'calls' | 'catalogue' | 'drivers' | 'customers' | 'managers' | 'support' | 'access';

/** Thrown before marking a call, or taking a mark back, when the call is no longer as ops
 * saw it — marked or taken back from another console in the meantime. `calls` context. */
export const CALL_CHANGED = 'CALL_CHANGED';

/** Thrown before deleting or answering a support message that is gone, or whose sender is
 * outside a staff account's region — one answer for both. `support` context. */
export const MESSAGE_NOT_FOUND = 'MESSAGE_NOT_FOUND';

/** Thrown before answering a support message whose sender's account no longer exists. */
export const SENDER_GONE = 'SENDER_GONE';

/** Thrown before switching a restaurant on or off when it is already in the state asked
 * for — `toggleEnableStores` flips whatever it finds, so a second console pressing the same
 * button would silently undo the first. */
export const RESTAURANT_STATE_CHANGED = 'RESTAURANT_STATE_CHANGED';

/** Thrown before assigning a manager whose account already runs another restaurant. */
export const MANAGER_TAKEN = 'MANAGER_TAKEN';

/** Thrown when a picked file isn't an image the browser can read. */
export const IMAGE_UNREADABLE = 'IMAGE_UNREADABLE';

/** Thrown before copying a menu or restaurant that no longer exists. */
export const COPY_SOURCE_MISSING = 'COPY_SOURCE_MISSING';

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

/** Thrown before activating or deactivating a driver who is already in the state asked for
 * — `toggleEnableUsers` flips whatever it finds, like `toggleEnableStores`. Not
 * `DRIVER_CHANGED`, which is the unassign flow's. */
export const DRIVER_STATE_CHANGED = 'DRIVER_STATE_CHANGED';

/** Thrown before writing to a staff or admin account from the Drivers screen. */
export const DRIVER_IS_STAFF = 'DRIVER_IS_STAFF';

/** Thrown before writing to a driver who doesn't exist, or who is outside a staff account's
 * region — deliberately the same answer for both. */
export const DRIVER_NOT_FOUND = 'DRIVER_NOT_FOUND';

/** Thrown before a manager write when the account or its restaurant is no longer as ops saw
 * it — already activated or deactivated (`toggleEnableUsers` flips), already given a
 * restaurant or taken off one, or on a restaurant that has moved on to another manager. */
export const MANAGER_ACCOUNT_CHANGED = 'MANAGER_ACCOUNT_CHANGED';

/** Thrown before writing to a staff or admin account from the Managers screen. */
export const MANAGER_IS_STAFF = 'MANAGER_IS_STAFF';

/** Thrown before writing to a manager (or a restaurant) that doesn't exist or is outside a
 * staff account's region — one answer for both, as `DRIVER_NOT_FOUND`. */
export const MANAGER_NOT_FOUND = 'MANAGER_NOT_FOUND';

/** Thrown before enabling or disabling a customer who is already in the state asked for —
 * `toggleEnableUsers` flips whatever it finds. */
export const CUSTOMER_STATE_CHANGED = 'CUSTOMER_STATE_CHANGED';

/** Thrown before writing to a customer who doesn't exist, is outside a staff account's region,
 * or is a staff account a staff member may not see — deliberately one answer for all three. */
export const CUSTOMER_NOT_FOUND = 'CUSTOMER_NOT_FOUND';

/** Thrown before the signed-in account changes its own account from the Customers screen. */
export const CUSTOMER_IS_SELF = 'CUSTOMER_IS_SELF';

/** Thrown before deleting a customer who runs a restaurant — `deleteUsers` would delete the
 * restaurant too. */
export const CUSTOMER_IS_MANAGER = 'CUSTOMER_IS_MANAGER';

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

  // The support inbox, ahead of the login strings: `sendPush` also answers
  // USER_DOES_NOT_EXISTS, for a sender whose account is gone. It reads `pushToken[appType]`
  // off a row that may have no `pushToken` at all, which is a TypeError on the server and a
  // 141 carrying its sentence here — the same answer as a missing token, to the person
  // sending. Only `sendPush` in this context reaches a cloud function with a row, so the
  // TypeError text can't mean anything else.
  if (context === 'support') {
    if (message === MESSAGE_NOT_FOUND) return 'errors.messageNotFound';
    if (message === SENDER_GONE || message === 'USER_DOES_NOT_EXISTS') return 'errors.senderGone';
    if (message === 'USER_PUSH_TOKEN_MISSING' || /pushToken|undefined/i.test(message ?? '')) {
      return 'errors.senderNoPushToken';
    }
  }

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

  // `cancelManager`'s refusal of an order whose food has left the restaurant.
  if (context === 'cancel') {
    if (message === 'ORDER_CANCELED') return 'errors.orderCanceled';
    if (message === 'ORDER_FULLFILLED') return 'errors.orderCollected';
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

  // Call marks are a plain save onto two `Order` columns the Parse Dashboard has to add
  // (docs/order-calls-backend.md). Until they exist, the save asks Parse to add a column,
  // which `Order` leaves to the master key: 119, "Permission denied for action addField".
  // That is setup still to do, not a permission this person lacks.
  if (context === 'calls') {
    if (message === CALL_CHANGED) return 'errors.callChanged';
    if (message === 'ORDER_CANCELED') return 'errors.orderCanceled';
    if (message?.includes('addField')) return 'errors.callsMissing';
  }

  // The catalogue writes: restaurants, menus, dishes and their pictures.
  if (context === 'catalogue') {
    if (message === RESTAURANT_STATE_CHANGED) return 'errors.restaurantChanged';
    if (message === MANAGER_TAKEN) return 'errors.managerTaken';
    if (message === IMAGE_UNREADABLE) return 'errors.imageUnreadable';
    if (message === COPY_SOURCE_MISSING) return 'errors.missingOrForbidden';
    const code = getErrorCode(error);
    // 130 is a file the server wouldn't store; 111 and 142 a row the schema refused — a
    // wrong type or a required column left out.
    if (code === 130) return 'errors.uploadFailed';
    if (code === 111 || code === 142) return 'errors.invalidData';
  }

  // Driver accounts. The three sentinels are this console's own guards; the rest come from
  // the platform. `PARAMS_MISSING` and `USER_PUSH_TOKEN_MISSING` are the cloud functions'
  // refusals, by message (switch-server cloud/main.js `CLOUD_ERRORS`). 202, 203 and 125 are
  // Parse's own `_User` rules — a taken username, a taken email, an email it won't store —
  // which can reach the browser either with their code or, rethrown from inside a cloud
  // function, as a 141 carrying Parse's sentence, hence the message checks alongside.
  if (context === 'managers') {
    if (message === MANAGER_ACCOUNT_CHANGED) return 'errors.managerAccountChanged';
    if (message === MANAGER_IS_STAFF) return 'errors.managerIsStaff';
    if (message === MANAGER_NOT_FOUND) return 'errors.managerNotFound';
    if (message === MANAGER_TAKEN) return 'errors.managerHasRestaurant';
    if (message === 'USER_PUSH_TOKEN_MISSING') return 'errors.managerNoPushToken';
  }

  // Managers share the drivers' account functions, so their Parse `_User` refusals too.
  if (context === 'drivers' || context === 'managers') {
    if (message === DRIVER_STATE_CHANGED) return 'errors.driverAccountChanged';
    if (message === DRIVER_IS_STAFF) return 'errors.driverIsStaff';
    if (message === DRIVER_NOT_FOUND) return 'errors.driverNotFound';
    if (message === 'PARAMS_MISSING') return 'errors.invalidData';
    if (message === 'USER_PUSH_TOKEN_MISSING') return 'errors.driverNoPushToken';
    const code = getErrorCode(error);
    const text = message ?? '';
    if (code === 202 || /username/i.test(text)) return 'errors.usernameTaken';
    if (code === 203 || /exists.*email/i.test(text)) return 'errors.emailTaken';
    if (code === 125 || /email/i.test(text)) return 'errors.emailInvalid';
  }

  // Customer accounts: the same platform functions as drivers, so the same Parse `_User`
  // refusals, plus this screen's own four guards.
  if (context === 'customers') {
    if (message === CUSTOMER_STATE_CHANGED) return 'errors.customerChanged';
    if (message === CUSTOMER_NOT_FOUND) return 'errors.customerNotFound';
    if (message === CUSTOMER_IS_SELF) return 'errors.customerIsSelf';
    if (message === CUSTOMER_IS_MANAGER) return 'errors.customerIsManager';
    if (message === 'PARAMS_MISSING') return 'errors.invalidData';
    const code = getErrorCode(error);
    const text = message ?? '';
    if (code === 202 || /username/i.test(text)) return 'errors.usernameTaken';
    if (code === 203 || /exists.*email/i.test(text)) return 'errors.emailTaken';
    if (code === 125 || /email/i.test(text)) return 'errors.emailInvalid';
  }

  // Granting Ops access, through `setOpsAccess` (docs/ops-access-backend.md). 141 is what
  // Parse answers for a function that isn't deployed — but also for anything a function
  // throws that isn't a Parse.Error — so "not deployed" is recognised by Parse's own
  // sentence, not by the code alone.
  if (context === 'access') {
    const code = getErrorCode(error);
    if (code === 141 && /invalid function/i.test(message ?? '')) return 'errors.accessUnavailable';
    if (code === 119) return 'errors.accessForbidden';
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
