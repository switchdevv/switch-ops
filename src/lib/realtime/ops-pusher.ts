import 'client-only';
import Pusher from 'pusher-js';
import { runFunction } from '@/lib/parse/cloud';

/**
 * The console's Pusher connection, for the server's live events (switch-server-v2 D-23).
 *
 * Every channel it joins is private. pusher-js asks `authorizeOpsChannel` to sign each
 * subscription, as a Parse cloud call carrying this console's session, so the server
 * applies the console's own access rules: an admin joins `private-ops` (every region),
 * a staff account only its own region's channel. `client-only`, like lib/parse/client.ts.
 */

/** Every region's events. Admins only. */
export const OPS_ALL_CHANNEL = 'private-ops';

/** One region's events. */
export function opsCityChannel(cityId: string): string {
  return `private-ops-city-${cityId}`;
}

/** What `declineDriver` sends when a driver turns down an order they were sent. */
export type DriverDeclinedEvent = {
  orderId: string;
  driverId: string;
  driverName: string | null;
  cityId: string | null;
  declinedAt: string;
};

export const DRIVER_DECLINED_EVENT = 'driverDeclined';

/** A new connection, or null when no Pusher key is configured. */
export function createOpsPusher(): Pusher | null {
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
  if (!key) return null;
  return new Pusher(key, {
    cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER || 'eu',
    channelAuthorization: {
      customHandler: ({ socketId, channelName }, callback) => {
        runFunction<{ socketId: string; channelName: string }, { auth: string }>('authorizeOpsChannel', {
          socketId,
          channelName,
        }).then(
          (data) => callback(null, data),
          // Legacy answers `141`, a revoked grant `119`: either way no live events, and the
          // board's own refresh still shows the decline.
          (error: unknown) => callback(error instanceof Error ? error : new Error(String(error)), null),
        );
      },
    },
  });
}
