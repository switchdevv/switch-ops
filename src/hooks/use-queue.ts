'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { DISPATCH_INTERVAL_MS } from '@/hooks/use-dispatch';
import { queryKeys } from '@/lib/query/keys';
import {
  listQueue,
  queueOrder,
  removeFromQueue,
  retryQueuedNow,
  swapRanks,
  type QueueRequest,
} from '@/lib/services/queue';
import { nudgeQueueRunner } from '@/lib/services/queue-channel';
import type { QueueEntry } from '@/types/queue';

/**
 * The driver queue as the screens read it — every row still in a line or recently sent.
 *
 * Refreshed on the map's own clock rather than the runner's faster one, so a line and the
 * orders it is made of move together. The runner re-reads straight from the server on
 * its own tick (see components/queue-runner.tsx) and invalidates this when it changes
 * something, so a sent order doesn't wait for the next refresh to show.
 */
export function useDispatchQueue(region: string, isLive: boolean) {
  return useQuery({
    queryKey: queryKeys.queue.list(region),
    queryFn: () => listQueue(region),
    placeholderData: keepPreviousData,
    refetchInterval: isLive ? DISPATCH_INTERVAL_MS : false,
    // Kept counting in a background tab for the same reason the map's orders are: a
    // queued order leaves the needs-a-driver count in the tab title.
    refetchIntervalInBackground: true,
  });
}

/** Everything a queue change can move: the lines, the map's orders, the board's counts. */
export function invalidateQueue(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: queryKeys.queue.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.dispatch.all });
  void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
}

/** Lines an order up behind a driver, or moves it to their line. Settled rather than
 * success, like assigning: a refusal means the screen is behind, and re-reading is how it
 * catches up. */
export function useQueueOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: QueueRequest) => queueOrder(request),
    onSettled: () => invalidateQueue(queryClient),
  });
}

export function useRemoveFromQueue() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => removeFromQueue(entryId),
    onSettled: () => invalidateQueue(queryClient),
  });
}

/** Sends a refused order on the runner's next look rather than after its retry delay —
 * and nudges the runner, in whichever tab holds it, to look now. */
export function useRetryQueued() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) => retryQueuedNow(entryId),
    onSuccess: () => nudgeQueueRunner(),
    onSettled: () => invalidateQueue(queryClient),
  });
}

export function useMoveUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ entry, ahead }: { entry: QueueEntry; ahead: QueueEntry }) => swapRanks(entry, ahead),
    onSettled: () => invalidateQueue(queryClient),
  });
}
