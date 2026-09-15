'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import {
  countNeedsDriver,
  listOrders,
  tallyStages,
  ORDER_PAGE_SIZE,
} from '@/lib/services/orders';
import type { OrderFilters } from '@/lib/url/order-filters';

export { ORDER_PAGE_SIZE };

/**
 * How often the board re-asks while auto-refresh is armed.
 *
 * Twenty seconds is the slowest interval at which a new order still feels like it
 * "arrived" rather than "was there when I looked". Faster buys nothing: an order takes
 * a minute to place, and every tick is a round-trip per open tab.
 */
export const LIVE_INTERVAL_MS = 20_000;

/**
 * One page of orders, plus the total for the same filters.
 *
 * `placeholderData: keepPreviousData` is what stops the board from collapsing to a
 * skeleton on every refresh tick — the rows stay on screen and are swapped underneath,
 * so a dispatcher mid-sentence on the phone doesn't lose the row they were reading.
 * The caller dims the list while `isPlaceholderData` is true instead.
 */
export function useOrders(
  filters: OrderFilters,
  page: number,
  isLive: boolean,
  /** Orders in a driver's queue, sorted. Only the needs-a-driver filter reads them, so
   * pass `[]` otherwise — a queue change shouldn't re-ask for every page of the board. */
  queued: readonly string[],
) {
  return useQuery({
    queryKey: queryKeys.orders.list(filters, page, queued),
    queryFn: () => listOrders(filters, page, queued),
    placeholderData: keepPreviousData,
    refetchInterval: isLive ? LIVE_INTERVAL_MS : false,
    // Off by default in React Query. Ops leaves this tab in a background window for
    // hours; the whole promise of the Live indicator is that it kept counting.
    refetchIntervalInBackground: false,
  });
}

/** The five stage counts behind the pipeline bar. */
export function useStageTallies(filters: OrderFilters, isLive: boolean) {
  return useQuery({
    queryKey: queryKeys.orders.stages(filters),
    queryFn: () => tallyStages(filters),
    placeholderData: keepPreviousData,
    refetchInterval: isLive ? LIVE_INTERVAL_MS : false,
  });
}

/** The number behind the "needs a driver" banner — queued orders left out. */
export function useNeedsDriverCount(filters: OrderFilters, isLive: boolean, queued: readonly string[]) {
  return useQuery({
    queryKey: queryKeys.orders.needsDriver(filters, queued),
    queryFn: () => countNeedsDriver(filters, queued),
    placeholderData: keepPreviousData,
    refetchInterval: isLive ? LIVE_INTERVAL_MS : false,
  });
}
