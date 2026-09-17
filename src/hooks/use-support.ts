'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReadMarks, SenderApp } from '@/lib/ops/support';
import { queryKeys } from '@/lib/query/keys';
import {
  countUnread,
  deleteMessage,
  getMessage,
  listMessages,
  listSenderDeliveries,
  listSenderMessages,
  listSenderOrders,
  replyToMessage,
} from '@/lib/services/support';
import type { SupportFilters } from '@/lib/url/support-filters';
import type { SupportMessage } from '@/types/message';

/**
 * How often the inbox is re-read while Live is on. A message is answered in minutes, not
 * seconds, and the server already pushes the staff app on each new one — this is the
 * console catching up, so the board's fifteen seconds would be load for nothing.
 */
export const SUPPORT_INTERVAL_MS = 30_000;

/**
 * One page of the inbox. `marks` is only passed — and only part of the key — for the Unread
 * view; the caller hands it a snapshot rather than the live marks, so opening a message
 * doesn't re-ask the server and pull the row out from under the reader.
 */
export function useSupportMessages(
  filters: SupportFilters,
  page: number,
  marks: ReadMarks | null,
  isLive: boolean,
  isEnabled = true,
) {
  const usedMarks = filters.unread ? marks : null;
  return useQuery({
    queryKey: queryKeys.support.list(filters, page, usedMarks),
    queryFn: () => listMessages(filters, page, usedMarks),
    placeholderData: keepPreviousData,
    refetchInterval: isLive ? SUPPORT_INTERVAL_MS : false,
    enabled: isEnabled && (!filters.unread || (marks !== null && marks.since > 0)),
  });
}

/**
 * The number on the Unread tab, with the live marks — it should drop the moment a message
 * is opened.
 *
 * Also the number on the shell's bell, which asks for the same filters (none, beyond the
 * account's region) and therefore shares this query: one request answers both while the
 * inbox is open. `intervalMs` is what differs — the bell re-reads slowly, because arrivals
 * reach it from the alert runner rather than from this timer (see components/support-bell.tsx).
 */
export function useSupportUnreadCount(
  filters: SupportFilters,
  marks: ReadMarks,
  isLive: boolean,
  isEnabled = true,
  intervalMs = SUPPORT_INTERVAL_MS,
) {
  return useQuery({
    queryKey: queryKeys.support.unread(filters, marks),
    queryFn: () => countUnread(filters, marks),
    placeholderData: keepPreviousData,
    refetchInterval: isLive ? intervalMs : false,
    enabled: isEnabled && marks.since > 0,
  });
}

/** The open message. Seeded from the list's own row when it is on the page, so the reader
 * fills in at once; read on its own for a pasted link. */
export function useSupportMessage(id: string, pinnedRegion: string, fromList: SupportMessage | undefined) {
  return useQuery({
    queryKey: queryKeys.support.detail(id, pinnedRegion),
    queryFn: () => getMessage(id, pinnedRegion),
    placeholderData: fromList,
    enabled: id.length > 0,
  });
}

export function useSenderMessages(userId: string, pinnedRegion: string) {
  return useQuery({
    queryKey: queryKeys.support.history(userId, pinnedRegion),
    queryFn: () => listSenderMessages(userId, pinnedRegion),
    enabled: userId.length > 0,
  });
}

export function useSenderOrders(userId: string, pinnedRegion: string, isEnabled = true) {
  return useQuery({
    queryKey: queryKeys.support.orders(userId, pinnedRegion),
    queryFn: () => listSenderOrders(userId, pinnedRegion),
    enabled: isEnabled && userId.length > 0,
    staleTime: 60_000,
  });
}

/**
 * The driver's deliveries up to the moment of the open message.
 *
 * Not on the inbox's timer: the set is fixed by `before`, and the states inside it move at
 * the pace of a delivery. Coming back to the tab re-reads it (the client's
 * `refetchOnWindowFocus`), and an edit made from the reader re-reads it by hand — which is
 * what a dispatcher correcting a total is waiting to see.
 */
export function useSenderDeliveries(driverId: string, before: string, pinnedRegion: string, isEnabled = true) {
  return useQuery({
    queryKey: queryKeys.support.deliveries(driverId, before, pinnedRegion),
    queryFn: () => listSenderDeliveries(driverId, before, pinnedRegion),
    enabled: isEnabled && driverId.length > 0 && before.length > 0,
    staleTime: 30_000,
  });
}

/** Settled rather than success: a refusal means the inbox was behind, and re-reading is how
 * it catches up. */
export function useDeleteMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pinnedRegion }: { id: string; pinnedRegion: string }) => deleteMessage(id, pinnedRegion),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: queryKeys.support.all }),
  });
}

/** A push changes nothing the inbox reads, so nothing is re-read after it. */
export function useReplyToMessage() {
  return useMutation({
    mutationFn: (reply: { id: string; app: SenderApp; body: string; pinnedRegion: string }) =>
      replyToMessage(reply.id, reply.app, reply.body, reply.pinnedRegion),
  });
}
