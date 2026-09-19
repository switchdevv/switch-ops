import 'client-only';
import Parse from 'parse';
import { installRequestDeadlines } from './deadline';

// Parse's browser build is localStorage-bound, so it may only ever be touched from
// the browser — never at module scope, never during a server render. The
// `client-only` import above turns an accidental server-side import of this module
// into a build-time error instead of a confusing runtime crash somewhere downstream.

let initialized = false;

/**
 * Returns the shared Parse SDK singleton, initializing it on first use.
 *
 * Guards on `Parse.applicationId` (not just the local `initialized` flag): Fast
 * Refresh can re-evaluate this module and reset `initialized` back to false, but
 * `Parse` itself is a singleton whose state survives across those re-evaluations, so
 * re-checking its own field keeps initialization genuinely once-per-page-load
 * instead of re-running (and re-pointing `serverURL`) on every edit.
 */
export function getParse(): typeof Parse {
  if (typeof window === 'undefined') {
    throw new Error('getParse() was called on the server — Parse is browser-only.');
  }

  if (!initialized || !Parse.applicationId) {
    const appId = process.env.NEXT_PUBLIC_PARSE_APP_ID;
    const serverURL = process.env.NEXT_PUBLIC_PARSE_SERVER_URL;

    if (!appId || !serverURL) {
      throw new Error(
        'Missing NEXT_PUBLIC_PARSE_APP_ID / NEXT_PUBLIC_PARSE_SERVER_URL. Copy .env.example to .env.local.',
      );
    }

    // Same appId/serverURL the switch-food, switch-driver and switch-manager RN
    // apps point at (src/configs/index.js in each). The second argument to
    // initialize() is a JavaScript key — this backend isn't configured with one
    // (the RN apps call initialize with a single argument too), so it's passed as
    // an empty string rather than made optional: Parse's own type declares it as
    // required, and an empty string is what the SDK treats as "no key" at runtime
    // (it's only sent as a header when truthy).
    Parse.initialize(appId, '');
    Parse.serverURL = serverURL;
    // Before the first request can be made: the SDK itself never gives up on one.
    installRequestDeadlines(Parse);
    initialized = true;
  }

  return Parse;
}
