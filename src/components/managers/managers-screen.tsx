'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@heroui/react';
import { useAccess } from '@/hooks/use-access';
import { useCities } from '@/hooks/use-cities';
import { useManagers } from '@/hooks/use-managers';
import { useNow } from '@/hooks/use-now';
import { pinnedRegionId } from '@/lib/auth/access';
import { useI18n } from '@/lib/i18n/provider';
import {
  buildManagerList,
  countManagerStatuses,
  managerRowMatches,
  MANAGER_STATUS_LABEL_KEY,
  MANAGER_STATUSES,
  type ManagerStatus,
} from '@/lib/ops/managers';
import { algiersClock } from '@/lib/ops/restaurant-hours';
import { MANAGER_LIST_LIMIT, MANAGER_PAGE_SIZE } from '@/lib/services/managers';
import {
  activeManagerFilterCount,
  confineManagersToRegion,
  emptyManagerFilters,
  parseManagerFilters,
  parseManagerListPage,
  serializeManagerFilters,
  type ManagerFilters,
} from '@/lib/url/manager-filters';
import { readRememberedSearch, writeRememberedSearch } from '@/lib/url/remembered-search';
import { LiveControl } from '@/components/ui/live-control';
import { Notice, type NoticeValue } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ListEmpty, PagedList } from '@/components/ui/paged-list';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SelectField, type SelectOption } from '@/components/ui/select-field';
import { SearchBox } from '@/components/restaurants/search-box';
import { PlusIcon } from '@/components/icons';
import { ManagerFormDialog } from './manager-form-dialog';
import { ManagerListRow } from './manager-row';

type StatusSegment = ManagerStatus | 'all';

/**
 * Restaurant managers — switch-dashboard's Users page filtered to the manager app, built
 * like the Drivers list: every manager in scope read at once, then searched, counted and
 * paged in the browser, with the state in the URL and a staff account pinned to its region.
 */
export function ManagersScreen() {
  const { t, tCount } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { region, account } = useAccess();
  const pinnedRegion = pinnedRegionId(region);
  const search = searchParams.toString();

  const filters = useMemo(
    () => confineManagersToRegion(parseManagerFilters(new URLSearchParams(search)), pinnedRegion),
    [search, pinnedRegion],
  );
  const page = parseManagerListPage(new URLSearchParams(search));

  // The bare `/managers` comes back to the list as it was last left — see DriversScreen.
  const memoryScope = `managers.${account?.objectId ?? ''}`;
  const restoreTo = search === '' ? readRememberedSearch(memoryScope) : null;
  const filtersSearch = serializeManagerFilters(filters, 1);

  useEffect(() => {
    if (restoreTo) router.replace(`${pathname}${restoreTo}`, { scroll: false });
    else writeRememberedSearch(memoryScope, filtersSearch);
  }, [restoreTo, filtersSearch, memoryScope, pathname, router]);

  const [isLive, setIsLive] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [notice, setNotice] = useState<NoticeValue | null>(null);
  const now = useNow(30_000);
  const clock = useMemo(() => algiersClock(now), [now]);

  const managersQuery = useManagers(filters.region, isLive, !restoreTo);
  const citiesQuery = useCities();

  // Remembered before navigating — see DriversScreen.
  const navigate = useCallback(
    (next: ManagerFilters, nextPage: number) => {
      writeRememberedSearch(memoryScope, serializeManagerFilters(next, 1));
      router.replace(`${pathname}${serializeManagerFilters(next, nextPage)}`, { scroll: false });
    },
    [memoryScope, pathname, router],
  );
  const applyFilters = useCallback(
    (patch: Partial<ManagerFilters>) => navigate({ ...filters, ...patch }, 1),
    [filters, navigate],
  );
  const resetFilters = useCallback(
    () => navigate(confineManagersToRegion(emptyManagerFilters(), pinnedRegion), 1),
    [navigate, pinnedRegion],
  );

  const views = useMemo(() => buildManagerList(managersQuery.data ?? []), [managersQuery.data]);
  const searched = useMemo(
    () => (filters.query ? views.filter((view) => managerRowMatches(view, filters.query)) : views),
    [views, filters.query],
  );
  const counts = useMemo(() => countManagerStatuses(searched), [searched]);
  const shown = useMemo(
    () => (filters.status ? searched.filter((view) => view.status === filters.status) : searched),
    [searched, filters.status],
  );

  const totalPages = Math.max(1, Math.ceil(shown.length / MANAGER_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const rows = shown.slice((safePage - 1) * MANAGER_PAGE_SIZE, safePage * MANAGER_PAGE_SIZE);

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
    ...MANAGER_STATUSES.map((status) => ({ key: status, label: `${t(MANAGER_STATUS_LABEL_KEY[status])} ${counts[status]}` })),
  ];

  const activeCount = activeManagerFilterCount(filters, pinnedRegion);
  const hasFilters = activeCount > 0;
  const isTruncated = (managersQuery.data?.length ?? 0) >= MANAGER_LIST_LIMIT;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={t('managers.eyebrow')}
        title={t('managers.list.title')}
        description={t('managers.list.subtitle')}
        actions={
          <>
            <LiveControl
              isLive={isLive}
              onToggle={() => setIsLive((current) => !current)}
              onRefresh={() => void managersQuery.refetch()}
              isFetching={managersQuery.isFetching}
              updatedAt={managersQuery.dataUpdatedAt}
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
              {t('managers.list.add')}
            </Button>
          </>
        }
      />

      {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}

      <section className="border-border/70 bg-surface rounded-card shadow-card border">
        <SearchBox
          query={filters.query}
          placeholder={t('managers.filters.searchPlaceholder')}
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

          {pinnedRegion && <p className="text-caption text-faint">{t('managers.filters.regionLocked')}</p>}
          {isTruncated && (
            <p className="text-caption text-warning-soft-foreground font-bold">
              {t('managers.list.truncated', { count: MANAGER_LIST_LIMIT })}
            </p>
          )}
        </div>
      </section>

      <PagedList
        status={managersQuery.status}
        error={managersQuery.error}
        isPlaceholderData={managersQuery.isPlaceholderData}
        isFetching={managersQuery.isFetching}
        page={safePage}
        pageSize={MANAGER_PAGE_SIZE}
        total={shown.length}
        rowCount={rows.length}
        errorTitle={t('managers.list.error')}
        onRetry={() => void managersQuery.refetch()}
        onPageChange={(nextPage) => navigate(filters, nextPage)}
        empty={
          <ListEmpty
            title={t('managers.list.emptyTitle')}
            body={hasFilters ? t('managers.list.emptyFiltered') : t('managers.list.emptyBody')}
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
        {rows.map((manager) => (
          <ManagerListRow
            key={manager.id}
            manager={manager}
            regionName={manager.row.city?.objectId ? cityNames.get(manager.row.city.objectId) : undefined}
            clock={clock}
          />
        ))}
      </PagedList>

      {isAdding && (
        <ManagerFormDialog
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
