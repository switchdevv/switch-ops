'use client';

import { useCallback, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAccess } from '@/hooks/use-access';
import { useCities } from '@/hooks/use-cities';
import { useNow } from '@/hooks/use-now';
import { useNeedsDriverCount, useOrders, useStageTallies } from '@/hooks/use-orders';
import { useDispatchQueue } from '@/hooks/use-queue';
import { pinnedRegionId } from '@/lib/auth/access';
import { useI18n } from '@/lib/i18n/provider';
import { resolveRange } from '@/lib/ops/date-range';
import type { OrderStage } from '@/lib/ops/order-status';
import { queueSlots, reviewQueue } from '@/lib/ops/queue';
import { ORDER_PAGE_SIZE } from '@/lib/services/orders';
import {
  confineToRegion,
  emptyFilters,
  parseOrderFilters,
  parsePage,
  serializeOrderFilters,
  type OrderFilters,
} from '@/lib/url/order-filters';
import { LiveControl } from '@/components/ui/live-control';
import { PageHeader } from '@/components/ui/page-header';
import { NeedsDriverBanner } from './needs-driver-banner';
import { OrderList } from './order-list';
import { OrdersToolbar } from './orders-toolbar';
import { PipelineBar } from './pipeline-bar';

const NONE: readonly string[] = [];

/**
 * The orders board.
 *
 * Filter state lives in the URL rather than in React state — see the note on
 * `ORDER_PARAM_KEYS`. That makes this component almost stateless: it reads the query
 * string, hands it to three queries, and writes a new query string when something
 * changes. The two things it does own are the ones nobody would want in a shared
 * link: whether auto-refresh is armed, and which rows are open.
 */
export function OrdersBoard() {
  const { t, format } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // The one place the URL becomes filters, and so the one place a staff account's
  // region is pinned over whatever the query string asked for. Everything below —
  // the list, the tallies, the unassigned count, the next URL written — is built from
  // this value, which is what keeps the scope from having to be re-applied per query.
  const { region } = useAccess();
  const pinnedRegion = pinnedRegionId(region);

  const filters = useMemo(
    () =>
      confineToRegion(
        parseOrderFilters(new URLSearchParams(searchParams.toString())),
        pinnedRegion,
      ),
    [searchParams, pinnedRegion],
  );
  const page = parsePage(new URLSearchParams(searchParams.toString()));

  const [isLive, setIsLive] = useState(true);
  const now = useNow();

  // The driver queue, for the orders on the board that ops have already lined up behind
  // a driver: they wear a "Queued" tag instead of the red one, and leave the count.
  const queueQuery = useDispatchQueue(filters.region, isLive);
  const slots = useMemo(
    () => queueSlots(reviewQueue(queueQuery.data ?? [], now)),
    [queueQuery.data, now],
  );
  const queued = useMemo(() => [...slots.keys()].sort(), [slots]);

  const ordersQuery = useOrders(filters, page, isLive, filters.needsDriver ? queued : NONE);
  const talliesQuery = useStageTallies(filters, isLive);
  const needsDriverQuery = useNeedsDriverCount(filters, isLive, queued);
  const citiesQuery = useCities();

  const navigate = useCallback(
    (nextFilters: OrderFilters, nextPage: number) => {
      // `scroll: false` because every one of these is a refinement of the list the
      // user is looking at — jumping them back to the top of the page to re-find
      // their place is the opposite of what the interaction asked for.
      router.replace(`${pathname}${serializeOrderFilters(nextFilters, nextPage)}`, {
        scroll: false,
      });
    },
    [pathname, router],
  );

  /** Any filter change resets to page one: page 7 of the old result set is almost
   * never a meaningful place in the new one, and landing on an empty page reads as
   * "the filter broke". */
  const applyFilters = useCallback(
    (patch: Partial<OrderFilters>) => navigate({ ...filters, ...patch }, 1),
    [filters, navigate],
  );

  /** "Clear all" clears everything the user chose — not the region they're confined
   * to, which no button in this toolbar can grant back. */
  const resetFilters = useCallback(
    () => navigate(confineToRegion(emptyFilters(), pinnedRegion), 1),
    [navigate, pinnedRegion],
  );

  const goToPage = useCallback(
    (nextPage: number) => navigate(filters, nextPage),
    [filters, navigate],
  );

  const refreshAll = useCallback(() => {
    void ordersQuery.refetch();
    void talliesQuery.refetch();
    void needsDriverQuery.refetch();
    void queueQuery.refetch();
  }, [ordersQuery, talliesQuery, needsDriverQuery, queueQuery]);

  const total = ordersQuery.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE));

  const rangeLabel =
    filters.range.preset === 'all'
      ? t('orders.range.anyDate')
      : filters.range.from === filters.range.to
        ? format.date(filters.range.start?.toISOString())
        : `${format.date(filters.range.start?.toISOString())} – ${format.date(filters.range.end?.toISOString())}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={t('orders.eyebrow')}
        title={t('orders.title')}
        description={t('orders.subtitle')}
        actions={
          <LiveControl
            isLive={isLive}
            onToggle={() => setIsLive((current) => !current)}
            onRefresh={refreshAll}
            isFetching={ordersQuery.isFetching}
            updatedAt={ordersQuery.dataUpdatedAt}
            now={now}
          />
        }
      />

      <NeedsDriverBanner
        count={needsDriverQuery.data}
        isFiltered={filters.needsDriver && filters.type === 'delivery'}
        onShow={() => applyFilters({ needsDriver: true, type: 'delivery', stage: '' })}
      />

      <PipelineBar
        tallies={talliesQuery.data}
        isPending={talliesQuery.isPending}
        rangeLabel={rangeLabel}
        activeStage={filters.stage}
        onSelectStage={(stage: OrderStage | '') => applyFilters({ stage })}
      />

      <OrdersToolbar
        filters={filters}
        cities={citiesQuery.data}
        pinnedRegion={pinnedRegion}
        onChange={applyFilters}
        onReset={resetFilters}
      />

      {/* Keyed on the page so paging resets which rows are expanded — those ids are
          not in the new page, and React's own way to reset state is a remount. */}
      <OrderList
        key={page}
        page={page}
        data={ordersQuery.data}
        status={ordersQuery.status}
        error={ordersQuery.error}
        isPlaceholderData={ordersQuery.isPlaceholderData}
        isFetching={ordersQuery.isFetching}
        totalPages={totalPages}
        now={now}
        queueSlots={slots}
        hasQuery={filters.query.length > 0}
        query={filters.query}
        canWidenDates={filters.range.preset !== 'all'}
        onPageChange={goToPage}
        onRetry={() => void ordersQuery.refetch()}
        onClearFilters={resetFilters}
        onWidenDates={() => applyFilters({ range: resolveRange('all') })}
      />
    </div>
  );
}
