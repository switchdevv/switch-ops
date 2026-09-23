'use client';

import { useState } from 'react';
import { Alert, Button, Skeleton } from '@heroui/react';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useI18n } from '@/lib/i18n/provider';
import type { QueueSlot } from '@/lib/ops/queue';
import { parseErrorKey } from '@/lib/parse/errors';
import { ORDER_PAGE_SIZE, type OrdersPage } from '@/lib/services/orders';
import type { OrderRow } from '@/types/order';
import { PaginationBar } from '@/components/ui/pagination-bar';
import { InboxIcon } from '@/components/icons';
import { OrderRowItem } from './order-row';

export function OrderList({
  page,
  data,
  status,
  error,
  isPlaceholderData,
  isFetching,
  totalPages,
  now,
  queueSlots,
  hasQuery,
  query,
  canWidenDates,
  onPageChange,
  onRetry,
  onClearFilters,
  onWidenDates,
}: {
  page: number;
  data: OrdersPage | undefined;
  status: 'pending' | 'error' | 'success';
  error: unknown;
  isPlaceholderData: boolean;
  isFetching: boolean;
  totalPages: number;
  now: number;
  /** The orders lined up in a driver's queue, by order id. */
  queueSlots: ReadonlyMap<string, QueueSlot>;
  hasQuery: boolean;
  query: string;
  /** The search is bounded by a date range that could be widened — see EmptyState. */
  canWidenDates: boolean;
  onPageChange: (page: number) => void;
  onRetry: () => void;
  onClearFilters: () => void;
  onWidenDates: () => void;
}) {
  const { t, format } = useI18n();

  // Which rows are open, by objectId. Held here rather than inside each row so that a
  // refresh tick — which replaces every row object — doesn't collapse whatever the
  // dispatcher had open. Multiple rows may be open at once on purpose: comparing two
  // orders from the same restaurant is a real thing people do on this screen.
  //
  // Changing page should clear it, and the board does that by keying this component on
  // the page number — remounting is React's own way to reset state, and it needs no
  // effect chasing the change after the fact.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  const toggle = (objectId: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(objectId)) next.add(objectId);
      return next;
    });

  // A live board shrinks under its reader: orders leave a stage filter as they move on, and
  // page 3 of "needs a driver" can be empty a minute later. Follow it back to the last page.
  const isPastEnd = usePageInRange({
    page,
    total: data?.count ?? 0,
    pageSize: ORDER_PAGE_SIZE,
    isSettled: status === 'success' && !isPlaceholderData,
    onPageChange,
  });

  if (status === 'pending' || isPastEnd) return <ListSkeleton />;

  if (status === 'error') {
    return (
      <Alert status="danger">
        <Alert.Content>
          <Alert.Title>{t('orders.error.title')}</Alert.Title>
          <Alert.Description>{t(parseErrorKey(error, 'fetch'))}</Alert.Description>
        </Alert.Content>
        <Button variant="secondary" size="sm" onPress={onRetry}>
          {t('common.retry')}
        </Button>
      </Alert>
    );
  }

  const rows: OrderRow[] = data?.results ?? [];
  const total = data?.count ?? 0;
  const from = (page - 1) * ORDER_PAGE_SIZE;

  // Everything on screen answers the *previous* filters — a filter or page change is in
  // flight and its rows have not landed yet.
  //
  // `isPlaceholderData` rather than `isFetching` on purpose: with the Live indicator
  // armed this query refetches every 20 seconds against the same key, and a bar that
  // swept the table three times a minute unprompted would train people to ignore it.
  // Placeholder data means the user asked for something different, which is exactly and
  // only when the table owes them a "working on it".
  const isUpdating = isPlaceholderData;

  return (
    <section
      aria-busy={isUpdating}
      className="border-border/70 bg-surface rounded-card shadow-card relative overflow-hidden border"
    >
      {isUpdating && <UpdatingBar />}

      {/* Dimmed, not replaced. A refresh tick or a page change swaps the rows
          underneath the user; showing a skeleton instead would blank the row they
          were reading out over the phone. The counts in the summary line are dimmed
          with them — "1–20 of 340" is just as stale as the rows it describes, and
          leaving it bright is what makes a slow filter look like a broken one.

          `pointer-events-none` because these rows are on their way out: expanding one,
          or pressing "Clear all filters" in an empty state that is about to be
          replaced, acts on a list that no longer exists. */}
      <div
        className={
          'transition-opacity ' + (isUpdating ? 'pointer-events-none opacity-50' : '')
        }
      >
        {rows.length === 0 ? (
          <EmptyState
            hasQuery={hasQuery}
            query={query}
            canWidenDates={canWidenDates}
            onClearFilters={onClearFilters}
            onWidenDates={onWidenDates}
          />
        ) : (
          <>
            <div className="border-separator/70 text-caption text-muted tabular flex items-center justify-between gap-3 border-b px-4 py-2.5">
              <span>
                {t('orders.pager.showing', {
                  from: format.number(from + 1),
                  to: format.number(from + rows.length),
                  total: format.number(total),
                })}
              </span>
              <span>{t('orders.pager.pageOf', { page, total: totalPages })}</span>
            </div>

            <ul className="flex flex-col">
              {rows.map((order) => (
                <OrderRowItem
                  key={order.objectId}
                  order={order}
                  now={now}
                  queueSlot={queueSlots.get(order.objectId)}
                  isExpanded={expanded.has(order.objectId)}
                  onToggle={() => toggle(order.objectId)}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      <PaginationBar
        page={page}
        totalPages={totalPages}
        isFetching={isFetching}
        onChange={onPageChange}
      />
    </section>
  );
}

/**
 * The "the table is fetching your filter" hairline.
 *
 * Sits on the card's top edge and is absolutely positioned, so arming and disarming it
 * never reflows a single row — the alternative, a spinner that appears in the summary
 * line, nudges the whole list down a few pixels at the exact moment the user is trying
 * to read it.
 *
 * Indeterminate because it is honest: the count query and the page query land
 * independently and neither reports progress, so any percentage would be invented.
 */
function UpdatingBar() {
  const { t } = useI18n();

  return (
    <div
      role="progressbar"
      aria-label={t('orders.list.updating')}
      className="bg-accent-soft absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden"
    >
      <span aria-hidden className="bg-accent ops-indeterminate absolute inset-y-0 start-0 w-1/3" />
    </div>
  );
}

/**
 * The empty state does the obvious next thing rather than only reporting failure.
 *
 * The common way to see this screen is searching for an order id while the board is
 * still on "Today" — the order exists, it is just from Tuesday. Saying "no results"
 * and stopping there teaches people the search is broken; offering the one-click
 * widening teaches them how the date filter works.
 */
function EmptyState({
  hasQuery,
  query,
  canWidenDates,
  onClearFilters,
  onWidenDates,
}: {
  hasQuery: boolean;
  query: string;
  canWidenDates: boolean;
  onClearFilters: () => void;
  onWidenDates: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
      <span className="bg-surface-secondary text-muted mb-2 grid size-12 place-items-center rounded-2xl">
        <InboxIcon className="size-6" />
      </span>
      <p className="text-h6 font-bold">{t('orders.empty.title')}</p>
      <p className="text-muted text-body max-w-prose">
        {hasQuery ? t('orders.empty.bodySearch', { query }) : t('orders.empty.body')}
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {hasQuery && canWidenDates && (
          <Button variant="primary" size="sm" onPress={onWidenDates}>
            {t('orders.empty.searchAllDates')}
          </Button>
        )}
        <Button variant="secondary" size="sm" onPress={onClearFilters}>
          {t('orders.empty.clear')}
        </Button>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <section className="border-border/70 bg-surface rounded-card shadow-card overflow-hidden border">
      {Array.from({ length: 8 }).map((_, index) => (
        <div
          key={index}
          className="border-separator/50 flex items-center gap-4 border-b px-4 py-4 last:border-b-0"
        >
          <Skeleton className="h-8 w-16 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
          <Skeleton className="h-4 flex-1 rounded-md" />
          <Skeleton className="rounded-pill h-6 w-28" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      ))}
    </section>
  );
}
