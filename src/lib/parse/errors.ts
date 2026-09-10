import type { MessageKey } from '@/lib/i18n/dictionary';

/**
 * Where the failing call came from — the same code means different things in each:
 * 101 is a wrong password at login and a missing/forbidden object on every read; 141 is
 * a rejected request generally, but at login it is specifically the `loginStaff` cloud
 * function not being deployed. Never map one code to one global message.
 *
 * `dispatch` is a write: assigning a driver from the live map.
 */
export type ErrorContext = 'login' | 'fetch' | 'dispatch';

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

function getErrorMessage(error: unknown): string | undefined {
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
