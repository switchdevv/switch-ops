import type Parse from 'parse';

/**
 * A deadline on every request this console sends to Parse.
 *
 * The SDK has none. Parse 8 sends each request as a bare `fetch` (RESTController.js:148-160)
 * and retries a 5xx up to five times, so a request the server never answers — a stalled
 * phone connection, an App Engine instance stuck behind its database pool — is a promise
 * that never settles. Everything in this console awaits one: the start-up gate, every list,
 * every dialog's Send button, the queue runner. That is how the console used to sit on a
 * spinner for as long as the connection stayed bad.
 *
 * Installed once, in lib/parse/client.ts, by replacing the SDK's REST controller with one
 * whose `request` is wrapped. Every SDK call site looks the controller up at call time
 * (`CoreManager.getRESTController()`), so this one wrapper reaches queries, `Cloud.run`,
 * `User.become`/`logOut`, object saves and file uploads alike. It has to be `request`, not
 * `ajax`: the SDK's own `request` calls its module-local `ajax`, never a replaced one
 * (RESTController.js:330).
 *
 * Two things the SDK forces on the implementation:
 *
 * - **An aborted Parse request resolves, it doesn't reject** — with `{results: []}`
 *   (RESTController.js:241-249). Handing that back would turn a timeout into an empty list,
 *   a missing row, or, in `become`, a blank user written over the session. So on expiry
 *   this rejects its *own* promise and throws away whatever the SDK's settles with.
 * - **Each retry is a new `fetch` with a new `AbortController`**, announced through
 *   `options.requestTask` (RESTController.js:122-145). The hook is chained, not replaced —
 *   a `Parse.Query` uses it for `cancel()` — and an attempt that starts after the deadline
 *   is aborted the moment it announces itself.
 */

/** A read: a list, a count, a row. Shorter than the runners' own 20 s patience
 * (`TICK_TIMEOUT_MS`, `SUPPORT_ALERT_TIMEOUT_MS`), so a hung read fails inside their look
 * with an error, instead of the look being abandoned with the request still open. */
export const READ_TIMEOUT_MS = 15_000;

/**
 * A write: a cloud function or a save.
 *
 * Deliberately longer than the queue's `CLAIM_TIMEOUT_MS` (30 s). The runner puts a row
 * back in line only when `assignDriver` fails *inside* the claim (lib/services/queue.ts,
 * `runQueueTick`); a failure after it leaves the row counted as sent. A timeout shorter than
 * the claim would make a send that actually went through retryable — the same order offered
 * twice.
 */
export const WRITE_TIMEOUT_MS = 45_000;

/** A picture upload from the restaurant forms — a few hundred KB over a phone connection. */
export const UPLOAD_TIMEOUT_MS = 120_000;

/** Signing out. The SDK clears the session from storage before it tells the server, so all
 * this waits on is a courtesy call — never worth a "Signing out…" that doesn't end. */
export const LOGOUT_TIMEOUT_MS = 8_000;

/** The message on a timeout's `Parse.Error` (code 124, `Parse.Error.TIMEOUT`). */
export const REQUEST_TIMEOUT = 'REQUEST_TIMEOUT';

type ParseSDK = typeof Parse;
type RestController = ReturnType<ParseSDK['CoreManager']['getRESTController']>;
type RequestOptions = NonNullable<Parameters<RestController['request']>[3]>;
type Abortable = { abort: () => void };
/** `requestTask` is how the SDK hands out each attempt's controller. It is real
 * (RESTController.js:142-145) but missing from the SDK's own option types. */
type WithTask = RequestOptions & { requestTask?: (task: Abortable) => void };

function deadlineFor(method: string, path: string): number {
  if (path === 'logout') return LOGOUT_TIMEOUT_MS;
  if (path.startsWith('files/')) return UPLOAD_TIMEOUT_MS;
  // Parse sends reads as a GET (tunnelled through a POST body by `request` itself — the
  // method seen here is still the caller's).
  return method === 'GET' ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS;
}

let installed = false;

export function installRequestDeadlines(sdk: ParseSDK): void {
  // Fast Refresh re-evaluates lib/parse/client.ts; the SDK singleton keeps its controller.
  if (installed) return;
  installed = true;

  const original = sdk.CoreManager.getRESTController();

  sdk.CoreManager.setRESTController({
    ...original,
    request(method, path, data, options) {
      const upstream = (options as WithTask | undefined)?.requestTask;
      let current: Abortable | null = null;
      let isExpired = false;

      const withTask: WithTask = {
        ...options,
        requestTask: (task) => {
          current = task;
          if (isExpired) task.abort();
          upstream?.(task);
        },
      };

      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          isExpired = true;
          current?.abort();
          reject(new sdk.Error(sdk.Error.TIMEOUT, REQUEST_TIMEOUT));
        }, deadlineFor(method, path));

        original.request(method, path, data, withTask).then(
          (value) => {
            clearTimeout(timer);
            if (!isExpired) resolve(value);
          },
          (error: unknown) => {
            clearTimeout(timer);
            if (!isExpired) reject(error);
          },
        );
      });
    },
  });
}
