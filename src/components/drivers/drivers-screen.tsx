'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@heroui/react';
import { useAccess } from '@/hooks/use-access';
import { useCities } from '@/hooks/use-cities';
import { useOngoingOrders } from '@/hooks/use-dispatch';
import { useDrivers } from '@/hooks/use-drivers';
import { useNow } from '@/hooks/use-now';
import { useDispatchQueue } from '@/hooks/use-queue';
import { pinnedRegionId } from '@/lib/auth/access';
import { useI18n } from '@/lib/i18n/provider';
import {
  buildDriverList,
  carryingByDriver,
  countDriverStatuses,
  driverRowMatches,
  DRIVER_STATUS_LABEL_KEY,
  DRIVER_STATUSES,
  queuedByDriver,
  type DriverStatus,
} from '@/lib/ops/drivers';
import { parseErrorKey } from '@/lib/parse/errors';
import { DRIVER_LIST_LIMIT, DRIVER_PAGE_SIZE } from '@/lib/services/drivers';
import {
  activeDriverFilterCount,
  confineDriversToRegion,
  emptyDriverFilters,
  parseDriverFilters,
  parseDriverListPage,
  serializeDriverFilters,
  type DriverFilters,
} from '@/lib/url/driver-filters';
import { readRememberedSearch, writeRememberedSearch } from '@/lib/url/remembered-search';
import { LiveControl } from '@/components/ui/live-control';
import { Notice, type NoticeValue } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ListEmpty, PagedList } from '@/components/ui/paged-list';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SelectField, type SelectOption } from '@/components/ui/select-field';
import { SearchBox } from '@/components/restaurants/search-box';
import { PlusIcon } from '@/components/icons';
import { DriverFormDialog } from './driver-form-dialog';
import { DriverListRow } from './driver-row';

type StatusSegment = DriverStatus | 'all';

/**
 * The fleet — switch-dashboard's Users page filtered to the driver app, for ops.
 *
 * Built like the restaurant list (the whole state in the query string, a staff account's
 * region pinned where the URL is read, the last search remembered per account), with one
 * difference: every driver in scope is read at once, and searching, counting and paging
 * happen in the browser. That is what lets the status control carry live counts, and what
 * lets a row say "delivering" from the same two reads the live map makes — the open orders
 * and the queue — rather than a third opinion.
 */
export function DriversScreen() {
  const { t, tCount } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { region, account } = useAccess();
  const pinnedRegion = pinnedRegionId(region);
  const search = searchParams.toString();

  const filters = useMemo(
    () => confineDriversToRegion(parseDriverFilters(new URLSearchParams(search)), pinnedRegion),
    [search, pinnedRegion],
  );
  const page = parseDriverListPage(new URLSearchParams(search));

  // Every way back here — the sidebar, a breadcrumb, reloading `/drivers` — arrives without
  // a query string, and is answered with the list as it was last left. Read during render
  // for the reason RestaurantsScreen gives.
  const memoryScope = `drivers.${account?.objectId ?? ''}`;
  const restoreTo = search === '' ? readRememberedSearch(memoryScope) : null;
  const filtersSearch = serializeDriverFilters(filters, 1);

  useEffect(() => {
    if (restoreTo) router.replace(`${pathname}${restoreTo}`, { scroll: false });
    else writeRememberedSearch(memoryScope, filtersSearch);
  }, [restoreTo, filtersSearch, memoryScope, pathname, router]);

  const [isLive, setIsLive] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [notice, setNotice] = useState<NoticeValue | null>(null);
  const now = useNow(15_000);

  const driversQuery = useDrivers(filters.region, isLive, !restoreTo);
  const ordersQuery = useOngoingOrders(filters.region, isLive);
  const queueQuery = useDispatchQueue(filters.region, isLive);
  const citiesQuery = useCities();

  // Remembered before navigating, not after: taking off the last filter — All, clearing the
  // search, Any region, Clear all — lands on the bare URL, which would otherwise restore the
  // very filters that were just taken off.
  const navigate = useCallback(
    (next: DriverFilters, nextPage: number) => {
      writeRememberedSearch(memoryScope, serializeDriverFilters(next, 1));
      router.replace(`${pathname}${serializeDriverFilters(next, nextPage)}`, { scroll: false });
    },
    [memoryScope, pathname, router],
  );
  const applyFilters = useCallback(
    (patch: Partial<DriverFilters>) => navigate({ ...filters, ...patch }, 1),
    [filters, navigate],
  );
  const resetFilters = useCallback(
    () => navigate(confineDriversToRegion(emptyDriverFilters(), pinnedRegion), 1),
    [navigate, pinnedRegion],
  );

  const views = useMemo(
    () =>
      buildDriverList(
        driversQuery.data ?? [],
        carryingByDriver(ordersQuery.data?.results ?? []),
        queuedByDriver(queueQuery.data ?? [], now),
        now,
      ),
    [driversQuery.data, ordersQuery.data, queueQuery.data, now],
  );
  // Counted after the search and before the status, so each segment says how many of the
  // drivers matching the search it would show.
  const searched = useMemo(
    () => (filters.query ? views.filter((view) => driverRowMatches(view.row, filters.query)) : views),
    [views, filters.query],
  );
  const counts = useMemo(() => countDriverStatuses(searched), [searched]);
  const shown = useMemo(
    () => (filters.status ? searched.filter((view) => view.status === filters.status) : searched),
    [searched, filters.status],
  );

  const totalPages = Math.max(1, Math.ceil(shown.length / DRIVER_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = shown.slice((safePage - 1) * DRIVER_PAGE_SIZE, safePage * DRIVER_PAGE_SIZE);

  const cityNames = useMemo(
    () => new Map((citiesQuery.data ?? []).map((city) => [city.objectId, city.name ?? city.objectId])),
    [citiesQuery.data],
  );
  const regionOptions: SelectOption[] = pinnedRegion
    ? [{ value: pinnedRegion, label: cityNames.get(pinnedRegion) ?? pinnedRegion }]
    : [
        { value: '', label: t('orders.filters.anyRegion') },
        ...(citiesQuery.data ?? []).map((city) => ({ value: city.objectId, label: city.name ?? city.objectId })),
      ];

  const statusOptions: { key: StatusSegment; label: string }[] = [
    { key: 'all', label: `${t('drivers.filters.all')} ${counts.all}` },
    ...DRIVER_STATUSES.map((status) => ({ key: status, label: `${t(DRIVER_STATUS_LABEL_KEY[status])} ${counts[status]}` })),
  ];

  const activeCount = activeDriverFilterCount(filters, pinnedRegion);
  const hasFilters = activeCount > 0;
  const isTruncated = (driversQuery.data?.length ?? 0) >= DRIVER_LIST_LIMIT;
  // Whether a row can say "delivering" or "N queued" rests on these two; the list itself
  // still stands without them, so they are reported rather than blocking it.
  const partialError = ordersQuery.isError
    ? t(parseErrorKey(ordersQuery.error, 'fetch'))
    : queueQuery.isError
      ? t(parseErrorKey(queueQuery.error, 'queue'))
      : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={t('drivers.eyebrow')}
        title={t('drivers.list.title')}
        description={t('drivers.list.subtitle')}
        actions={
          <>
            <LiveControl
              isLive={isLive}
              onToggle={() => setIsLive((current) => !current)}
              onRefresh={() => {
                void driversQuery.refetch();
                void ordersQuery.refetch();
                void queueQuery.refetch();
              }}
              isFetching={driversQuery.isFetching}
              updatedAt={driversQuery.dataUpdatedAt}
              now={now}
            />
            <Button
              variant="primary"
              size="md"
              onPress={() => {
                setNotice(null);
                setIsAdding(true);
              }}
            >
              <PlusIcon aria-hidden className="size-4" />
              {t('drivers.list.add')}
            </Button>
          </>
        }
      />

      {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}

      <section className="border-border/70 bg-surface rounded-card shadow-card border">
        <SearchBox
          query={filters.query}
          placeholder={t('drivers.filters.searchPlaceholder')}
          onSubmit={(query) => applyFilters({ query })}
        />

        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-end gap-3">
            <SelectField
              label={t('orders.filters.region')}
              value={filters.region}
              options={regionOptions}
              isDisabled={pinnedRegion.length > 0}
              onChange={(regionId) => applyFilters({ region: regionId })}
              className="w-44"
            />

            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-micro text-muted font-bold tracking-[0.1em] uppercase">
                {t('drivers.filters.status')}
              </span>
              <div className="max-w-full overflow-x-auto">
                <SegmentedControl
                  label={t('drivers.filters.status')}
                  options={statusOptions}
                  value={filters.status || 'all'}
                  onChange={(key) => applyFilters({ status: key === 'all' ? '' : key })}
                />
              </div>
            </div>

            {hasFilters && (
              <Button variant="ghost" size="sm" onPress={resetFilters} className="h-9">
                {t('orders.filters.reset')} · {tCount('orders.filters.active', activeCount)}
              </Button>
            )}
          </div>

          {pinnedRegion && <p className="text-caption text-faint">{t('drivers.filters.regionLocked')}</p>}
          {isTruncated && (
            <p className="text-caption text-warning-soft-foreground font-bold">
              {t('drivers.list.truncated', { count: DRIVER_LIST_LIMIT })}
            </p>
          )}
          {partialError && (
            <p className="text-caption text-danger">{t('drivers.list.partial', { reason: partialError })}</p>
          )}
        </div>
      </section>

      <PagedList
        status={driversQuery.status}
        error={driversQuery.error}
        isPlaceholderData={driversQuery.isPlaceholderData}
        isFetching={driversQuery.isFetching}
        page={safePage}
        pageSize={DRIVER_PAGE_SIZE}
        total={shown.length}
        rowCount={rows.length}
        errorTitle={t('drivers.list.error')}
        onRetry={() => void driversQuery.refetch()}
        onPageChange={(nextPage) => navigate(filters, nextPage)}
        empty={
          <ListEmpty
            title={t('drivers.list.emptyTitle')}
            body={hasFilters ? t('drivers.list.emptyFiltered') : t('drivers.list.emptyBody')}
            actions={
              hasFilters ? (
                <Button variant="secondary" size="sm" onPress={resetFilters}>
                  {t('orders.empty.clear')}
                </Button>
              ) : undefined
            }
          />
        }
      >
        {rows.map((driver) => (
          <DriverListRow
            key={driver.id}
            driver={driver}
            regionName={driver.row.city?.objectId ? cityNames.get(driver.row.city.objectId) : undefined}
            now={now}
          />
        ))}
      </PagedList>

      {isAdding && (
        <DriverFormDialog
          onClose={() => setIsAdding(false)}
          onDone={(message) => {
            setIsAdding(false);
            setNotice({ kind: 'success', title: message });
          }}
        />
      )}
    </div>
  );
}
