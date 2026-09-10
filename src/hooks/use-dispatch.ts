'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { assignDriver, listOngoingOrders, listOnlineDrivers } from '@/lib/services/dispatch';

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

export type AssignRequest = { orderId: string; driverId: string };

/**
 * Assigning a driver — the one write this console makes.
 *
 * Nothing is updated optimistically. What `assignDriver` does beyond setting the field
 * (notifying the driver, and whatever the driver app does next) happens on the server,
 * and painting the order blue before the server says so would be the map claiming a
 * dispatch it can't see. The re-read after it lands is at most one round-trip.
 */
export function useAssignDriver() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderId, driverId }: AssignRequest) => assignDriver(orderId, driverId),
    // Settled, not just success: the refusals (a driver who went offline, an order
    // someone else just took) mean the map is behind, and re-reading is how it catches
    // up. The board's own lists and counts are re-read too — the same order is on it.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dispatch.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    },
  });
}
