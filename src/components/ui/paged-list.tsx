'use client';

import type { ReactNode } from 'react';
import { Alert, Button, Skeleton } from '@heroui/react';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useI18n } from '@/lib/i18n/provider';
import { parseErrorKey } from '@/lib/parse/errors';
import { InboxIcon } from '@/components/icons';
import { PaginationBar } from './pagination-bar';

/**
 * The frame every catalogue list sits in — loading, failed, empty, and a page of rows with
 * its range above and its pager below. The orders board's list behaves the same way (see
 * components/orders/order-list.tsx); this is that behaviour without the order rows.
 *
 * While a filter or page change is in flight the old rows stay, dimmed, under a hairline —
 * `isPlaceholderData`, not `isFetching`, because a re-read after a save is not something
 * the user asked to wait for.
 */
export function PagedList({
  status,
  error,
  isPlaceholderData,
  isFetching,
  page,
  pageSize,
  total,
  rowCount,
  errorTitle,
  empty,
  onRetry,
  onPageChange,
  children,
}: {
  status: 'pending' | 'error' | 'success';
  error: unknown;
  isPlaceholderData: boolean;
  isFetching: boolean;
  page: number;
  pageSize: number;
  total: number;
  rowCount: number;
  errorTitle: string;
  empty: ReactNode;
  onRetry: () => void;
  onPageChange: (page: number) => void;
  /** The rows, as `<li>` elements. */
  children: ReactNode;
}) {
  const { t, format } = useI18n();
  const isPastEnd = usePageInRange({
    page,
    total,
    pageSize,
    isSettled: status === 'success' && !isPlaceholderData,
    onPageChange,
  });

  if (status === 'pending' || isPastEnd) return <ListSkeleton />;

  if (status === 'error') {
    return (
      <Alert status="danger">
        <Alert.Content>
          <Alert.Title>{errorTitle}</Alert.Title>
          <Alert.Description>{t(parseErrorKey(error, 'fetch'))}</Alert.Description>
        </Alert.Content>
        <Button variant="secondary" size="sm" onPress={onRetry}>
          {t('common.retry')}
        </Button>
      </Alert>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize;

  return (
    <section
      aria-busy={isPlaceholderData}
      className="border-border/70 bg-surface rounded-card shadow-card relative overflow-hidden border"
    >
      {isPlaceholderData && (
        <div
          role="progressbar"
          aria-label={t('orders.list.updating')}
          className="bg-accent-soft absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden"
        >
          <span aria-hidden className="bg-accent ops-indeterminate absolute inset-y-0 start-0 w-1/3" />
        </div>
      )}

      <div className={'transition-opacity ' + (isPlaceholderData ? 'pointer-events-none opacity-50' : '')}>
        {rowCount === 0 ? (
          empty
        ) : (
          <>
            <div className="border-separator/70 text-caption text-muted tabular flex items-center justify-between gap-3 border-b px-4 py-2.5">
              <span>
                {t('orders.pager.showing', {
                  from: format.number(from + 1),
                  to: format.number(from + rowCount),
                  total: format.number(total),
                })}
              </span>
              <span>{t('orders.pager.pageOf', { page, total: totalPages })}</span>
            </div>
            <ul className="flex flex-col">{children}</ul>
          </>
        )}
      </div>

      <PaginationBar page={page} totalPages={totalPages} isFetching={isFetching} onChange={onPageChange} />
    </section>
  );
}

/** The empty state inside a list card — says what is missing and offers the way out. */
export function ListEmpty({ title, body, actions }: { title: string; body: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
      <span className="bg-surface-secondary text-muted mb-2 grid size-12 place-items-center rounded-2xl">
        <InboxIcon className="size-6" />
      </span>
      <p className="text-h6 font-bold">{title}</p>
      <p className="text-muted text-body max-w-prose">{body}</p>
      {actions && <div className="mt-3 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  );
}

function ListSkeleton() {
  return (
    <section className="border-border/70 bg-surface rounded-card shadow-card overflow-hidden border">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="border-separator/50 flex items-center gap-4 border-b px-4 py-4 last:border-b-0">
          <Skeleton className="size-12 rounded-xl" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-1/3 rounded-md" />
            <Skeleton className="h-3 w-1/2 rounded-md" />
          </div>
          <Skeleton className="rounded-pill h-6 w-24" />
        </div>
      ))}
    </section>
  );
}
