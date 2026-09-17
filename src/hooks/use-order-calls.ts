'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAccess } from '@/hooks/use-access';
import type { CallStep } from '@/lib/ops/order-calls';
import { currentUserId } from '@/lib/parse/objects';
import { queryKeys } from '@/lib/query/keys';
import { recordCall, undoCall, type CallAuthor } from '@/lib/services/order-calls';
import type { CallOutcome } from '@/types/order';

export type RecordCallRequest = { orderId: string; step: CallStep; outcome: CallOutcome };

export type UndoCallRequest = {
  orderId: string;
  step: CallStep;
  /** When the mark being taken back was made — the one ops saw. */
  at: string;
};

/**
 * Re-reads every screen an order sits on: the board (and the tallies above it) and the
 * live map. Returned rather than fired and forgotten — a mutation whose `onSettled` returns
 * a promise stays pending until it settles, so a chip keeps showing the mark being saved
 * until the re-read carries it, instead of flicking back to "not called" in between.
 */
function useRereadOrders() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.dispatch.all }),
    ]);
}

/** The signed-in agent, as a mark records them. */
function useCallAuthor(): () => CallAuthor {
  const { account } = useAccess();
  return () => ({
    id: account?.objectId ?? currentUserId() ?? '',
    name: account?.fullname ?? account?.username ?? '',
  });
}

/** Marks a call answered or unanswered. */
export function useRecordCall() {
  const author = useCallAuthor();
  const reread = useRereadOrders();
  return useMutation({
    mutationFn: ({ orderId, step, outcome }: RecordCallRequest) => recordCall(orderId, step, outcome, author()),
    onSettled: reread,
  });
}

/** Takes back a call's last mark. */
export function useUndoCall() {
  const reread = useRereadOrders();
  return useMutation({
    mutationFn: ({ orderId, step, at }: UndoCallRequest) => undoCall(orderId, step, at),
    onSettled: reread,
  });
}
