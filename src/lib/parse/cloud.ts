import { getParse } from './client';

/**
 * Runs a Parse cloud function — the platform's own vocabulary for anything that writes.
 *
 * Every action ops takes on an order goes through one of these rather than a direct
 * object save, because the function does more than write the row: `assignDriver`, for
 * one, also notifies the driver it names. Saving `order.driver` from this console would
 * set the field and tell nobody. Same calls, same parameters as switch-dashboard's
 * `callFunction` (src/api/modules/cloud.js).
 */
export function runFunction<Params extends Record<string, unknown>, Result = unknown>(
  name: string,
  params: Params,
): Promise<Result> {
  return getParse().Cloud.run<(params: Params) => Result>(name, params);
}
