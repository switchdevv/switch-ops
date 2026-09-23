'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Alert, Button, Skeleton } from '@heroui/react';
import { useDriverDeliveries } from '@/hooks/use-drivers';
import { shortId } from '@/lib/format';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { useI18n } from '@/lib/i18n/provider';
import { resolveRange } from '@/lib/ops/date-range';
import { driverBalanceOf, summarizeDeliveries } from '@/lib/ops/driver-settlement';
import type { DriverView } from '@/lib/ops/drivers';
import { parseErrorKey } from '@/lib/parse/errors';
import { DRIVER_RANGES, type DriverPage, type DriverRange } from '@/lib/url/driver-filters';
import { emptyFilters, ordersHref, serializeOrderFilters } from '@/lib/url/order-filters';
import type { OrderRow } from '@/types/order';
import { PaginationBar } from '@/components/ui/pagination-bar';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StageChip } from '@/components/ui/stage-chip';
import { ExternalLinkIcon } from '@/components/icons';

/** Rows per page of the table. The whole period is still read at once — the totals above it
 * add up every order — so paging is only how much of it is on screen. */
const DELIVERY_PAGE_SIZE = 25;

const RANGE_LABEL: Record<DriverRange, MessageKey> = {
  today: 'orders.range.today',
  yesterday: 'orders.range.yesterday',
  week: 'orders.range.week',
  month: 'orders.range.month',
};

/**
 * A driver's orders in one period, with what they and Switch owe each other for them — the
 * dashboard's Orders page searched by driver, with its per-order figure added up.
 *
 * The rule behind every number is in lib/ops/driver-settlement.ts. The period is in the URL,
 * and the orders board is one link away with the same driver and period, for the paging and
 * the per-order detail this panel doesn't try to be.
 */
export function DriverDeliveries({
  driver,
  page,
  pinnedRegion,
  onRangeChange,
}: {
  driver: DriverView;
  page: DriverPage;
  pinnedRegion: string;
  onRangeChange: (preset: DriverRange) => void;
}) {
  const { t, format } = useI18n();
  const query = useDriverDeliveries(driver.id, page.range, pinnedRegion);
  const summary = useMemo(() => summarizeDeliveries(query.data?.results ?? []), [query.data]);

  const name = driver.row.fullname ?? driver.row.username ?? t('common.none');
  const orders = query.data?.results ?? [];
  const isTruncated = !!query.data && query.data.count > query.data.results.length;

  // Back to the first page when the period changes, and never past the last one — a refresh
  // can bring back fewer orders than the page was opened on.
  const [paging, setPaging] = useState({ preset: page.preset, page: 1 });
  const totalPages = Math.max(1, Math.ceil(orders.length / DELIVERY_PAGE_SIZE));
  const tablePage = Math.min(paging.preset === page.preset ? paging.page : 1, totalPages);
  const from = (tablePage - 1) * DELIVERY_PAGE_SIZE;
  const pageRows = orders.slice(from, from + DELIVERY_PAGE_SIZE);
  const boardHref = `/orders${serializeOrderFilters(
    { ...emptyFilters(), query: driver.id, field: 'driver', range: resolveRange(page.preset) },
    1,
  )}`;

  const balance =
    summary.net > 0
      ? t('drivers.deliveries.driverOwes', { driver: name, amount: format.money(summary.net, summary.currency) })
      : summary.net < 0
        ? t('drivers.deliveries.switchOwes', { driver: name, amount: format.money(-summary.net, summary.currency) })
        : t('drivers.deliveries.settledUp');

  return (
    <section className="border-border/70 bg-surface rounded-card shadow-card flex flex-col border">
      <div className="border-separator/70 flex flex-wrap items-center justify-between gap-3 border-b p-4 sm:p-5">
        <h2 className="text-h6 font-bold">{t('drivers.deliveries.title')}</h2>
        <div className="flex flex-wrap items-center gap-3">
          <div className="max-w-full overflow-x-auto">
            <SegmentedControl
              label={t('drivers.deliveries.range')}
              options={DRIVER_RANGES.map((preset) => ({ key: preset, label: t(RANGE_LABEL[preset]) }))}
              value={page.preset}
              onChange={onRangeChange}
            />
          </div>
          <Link href={boardHref} className="text-caption text-link inline-flex items-center gap-1 font-bold hover:underline">
            {t('drivers.deliveries.openBoard')}
            <ExternalLinkIcon aria-hidden className="size-3.5" />
          </Link>
        </div>
      </div>

      {query.status === 'pending' ? (
        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : query.status === 'error' ? (
        <div className="p-4 sm:p-5">
          <Alert status="danger">
            <Alert.Content>
              <Alert.Title>{t('drivers.deliveries.error')}</Alert.Title>
              <Alert.Description>{t(parseErrorKey(query.error, 'fetch'))}</Alert.Description>
            </Alert.Content>
            <Button variant="secondary" size="sm" onPress={() => void query.refetch()}>
              {t('common.retry')}
            </Button>
          </Alert>
        </div>
      ) : (
        <div
          aria-busy={query.isPlaceholderData}
          className={'flex flex-col transition-opacity ' + (query.isPlaceholderData ? 'pointer-events-none opacity-50' : '')}
        >
          <div className="grid grid-cols-2 gap-px border-b border-separator/70 bg-separator/40 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label={t('drivers.deliveries.delivered')} value={format.number(summary.delivered)} />
            <Stat label={t('drivers.deliveries.open')} value={format.number(summary.open)} />
            <Stat label={t('drivers.deliveries.canceled')} value={format.number(summary.canceled)} />
            <Stat label={t('drivers.deliveries.cash')} value={format.number(summary.cash)} />
            <Stat label={t('drivers.deliveries.card')} value={format.number(summary.card)} />
            <Stat
              label={t('drivers.deliveries.deliveryFees')}
              value={format.money(summary.deliveryFees, summary.currency)}
            />
          </div>

          <div className="border-separator/70 flex flex-col gap-1 border-b p-4 sm:p-5">
            <p
              className={
                'text-h5 tabular font-bold ' +
                (summary.net > 0 ? 'text-warning-soft-foreground' : summary.net < 0 ? 'text-accent-soft-foreground' : '')
              }
            >
              {balance}
            </p>
            <p className="text-caption text-faint max-w-prose">{t('drivers.deliveries.balanceHint')}</p>
            {isTruncated && (
              <p className="text-caption text-warning-soft-foreground font-bold">
                {t('drivers.deliveries.truncated', { count: orders.length })}
              </p>
            )}
          </div>

          {orders.length === 0 ? (
            <p className="text-body text-muted px-4 py-10 text-center sm:px-5">{t('drivers.deliveries.empty')}</p>
          ) : (
            <>
              {totalPages > 1 && (
                <div className="border-separator/70 text-caption text-muted tabular flex items-center justify-between gap-3 border-b px-4 py-2.5">
                  <span>
                    {t('orders.pager.showing', {
                      from: format.number(from + 1),
                      to: format.number(from + pageRows.length),
                      total: format.number(orders.length),
                    })}
                  </span>
                  <span>{t('orders.pager.pageOf', { page: tablePage, total: totalPages })}</span>
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="text-caption w-full min-w-[46rem]">
                  <thead className="text-micro text-muted tracking-[0.1em] uppercase">
                    <tr className="border-separator/70 border-b">
                      <Th>{t('drivers.deliveries.order')}</Th>
                      <Th>{t('drivers.deliveries.restaurant')}</Th>
                      <Th>{t('orders.filters.stage')}</Th>
                      <Th>{t('drivers.deliveries.payment')}</Th>
                      <Th isNumeric>{t('drivers.deliveries.delivery')}</Th>
                      <Th isNumeric>{t('drivers.deliveries.service')}</Th>
                      <Th isNumeric>{t('drivers.deliveries.balance')}</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map((order) => (
                      <DeliveryRow key={order.objectId} order={order} />
                    ))}
                  </tbody>
                </table>
              </div>
              <PaginationBar
                page={tablePage}
                totalPages={totalPages}
                isFetching={false}
                onChange={(next) => setPaging({ preset: page.preset, page: next })}
              />
            </>
          )}
        </div>
      )}
    </section>
  );
}

function DeliveryRow({ order }: { order: OrderRow }) {
  const { t, format } = useI18n();
  const currency = order.city?.currency;
  const options = order.options ?? {};
  const balance = driverBalanceOf(order);
  const method = options.paymentMethod;

  return (
    <tr className="border-separator/50 border-b last:border-b-0">
      <td className="px-4 py-2.5 align-top">
        <Link href={ordersHref('objectId', order.objectId)} className="tabular hover:text-link font-bold">
          #{shortId(order.objectId)}
        </Link>
        <span className="text-faint tabular block">{format.dateTime(order.createdAt)}</span>
      </td>
      <td className="max-w-[14rem] truncate px-4 py-2.5 align-top">{order.restaurant?.name ?? t('common.none')}</td>
      <td className="px-4 py-2.5 align-top">
        <StageChip order={order} />
      </td>
      <td className="px-4 py-2.5 align-top">
        {method === 'cash'
          ? t('orders.detail.cash')
          : method === 'creditcards'
            ? t('orders.detail.creditcards')
            : t('orders.detail.unknownMethod')}
        {options.freeDelivery && <span className="text-faint block">{t('orders.detail.freeDelivery')}</span>}
      </td>
      <td className="tabular px-4 py-2.5 text-end align-top">{format.money(options.delivery ?? 0, currency)}</td>
      <td className="tabular px-4 py-2.5 text-end align-top">{format.money(options.service ?? 0, currency)}</td>
      <td className="tabular px-4 py-2.5 text-end align-top font-bold">
        {balance === null ? (
          <span className="text-faint font-normal">{t('drivers.deliveries.notCounted')}</span>
        ) : (
          `${balance > 0 ? '+' : ''}${format.money(balance, currency)}`
        )}
      </td>
    </tr>
  );
}

function Th({ children, isNumeric }: { children: ReactNode; isNumeric?: boolean }) {
  return (
    <th scope="col" className={'px-4 py-2 font-bold ' + (isNumeric ? 'text-end' : 'text-start')}>
      {children}
    </th>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface flex flex-col gap-0.5 px-4 py-3">
      <span className="text-micro text-muted font-bold tracking-[0.1em] uppercase">{label}</span>
      <span className="text-h5 tabular font-bold">{value}</span>
    </div>
  );
}
