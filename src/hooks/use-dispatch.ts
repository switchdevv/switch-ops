'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { assignDriver, getOrderContents, listOngoingOrders, listOnlineDrivers } from '@/lib/services/dispatch';
import { settleQueueAfterAssign } from '@/lib/services/queue';

/**
 * How often the live map re-asks while Live is on.
 *
 * Faster than the board's 20 seconds because what this screen watches moves: the driver
 * app writes a new position every 30 metres of movement, which on a scooter in traffic is
 * every few seconds. Fifteen keeps a moving pin within a street or two of the truth
 * without re-reading, most ticks, positions nobody has written yet.
 */
export const DISPATCH_INTERVAL_MS = 15_000;

/** Every open order in the region, drivers and addresses included. */
export function useOngoingOrders(region: string, isLive: boolean) {
  return useQuery({
    queryKey: queryKeys.dispatch.orders(region),
    queryFn: () => listOngoingOrders(region),
    // The pins stay where they are while a refresh or a region change is in flight,
    // rather than the map emptying and refilling under the dispatcher's cursor.
    placeholderData: keepPreviousData,
    refetchInterval: isLive ? DISPATCH_INTERVAL_MS : false,
    // Kept counting in a background tab, unlike the drivers below: the tab's title
    // carries the needs-a-driver count (see DispatchScreen), and the whole point of it is
    // to be read while ops is looking at something else.
    refetchIntervalInBackground: true,
  });
}

/** Every online driver in the region. Positions only matter while someone is looking, so
 * this one rests with the tab. */
export function useOnlineDrivers(region: string, isLive: boolean) {
  return useQuery({
    queryKey: queryKeys.dispatch.drivers(region),
    queryFn: () => listOnlineDrivers(region),
    placeholderData: keepPreviousData,
    refetchInterval: isLive ? DISPATCH_INTERVAL_MS : false,
  });
}

/** The basket and promo of the order open in the map's panel — the list read doesn't carry
 * them (see `ORDER_INCLUDES` in lib/services/dispatch.ts). A basket changes only through an
 * edit, which invalidates `dispatch.all`, so a minute's freshness is plenty. */
export function useOrderContents(orderId: string) {
  return useQuery({
    queryKey: queryKeys.dispatch.contents(orderId),
    queryFn: () => getOrderContents(orderId),
    enabled: orderId.length > 0,
    staleTime: 60_000,
  });
}

export type AssignRequest = { orderId: string; driverId: string };

/**
 * What the confirmation strip is holding: a driver put on an order now (`assign`), or an
 * order lined up behind a driver who is on another job (`queue`).
 */
export type DispatchRequest = AssignRequest & { kind: 'assign' | 'queue' };

/**
 * Puts a driver on an order and takes the order out of every queue — the whole of a manual
 * assign, shared by the map's Assign and the confirm step's "Confirm & send".
 */
export async function sendDriver({ orderId, driverId }: AssignRequest): Promise<void> {
  await assignDriver(orderId, driverId);
  // After the assign, never instead of it: the driver has been sent, and a queue that
  // couldn't be updated (the class not created yet, a dropped connection) is no reason
  // to report a failed assign. The runner still drops the row once the order shows
  // the driver ops chose.
  await settleQueueAfterAssign(orderId, driverId).catch((error: unknown) => {
    if (process.env.NODE_ENV !== 'production') console.error('[queue] after assign', error);
  });
}

/**
 * Assigning a driver by hand.
 *
 * Nothing is updated optimistically. What `assignDriver` does beyond setting the field
 * (notifying the driver, and whatever the driver app does next) happens on the server,
 * and painting the order blue before the server says so would be the map claiming a
 * dispatch it can't see. The re-read after it lands is at most one round-trip.
 */
export function useAssignDriver() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: sendDriver,
    // Settled, not just success: the refusals (a driver who went offline, an order
    // someone else just took) mean the map is behind, and re-reading is how it catches
    // up. The board's own lists and counts are re-read too — the same order is on it.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.queue.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dispatch.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
  });
}
