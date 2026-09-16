'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@heroui/react';
import { useAccess } from '@/hooks/use-access';
import { useCities } from '@/hooks/use-cities';
import { useNow } from '@/hooks/use-now';
import { useCategories, useRestaurants } from '@/hooks/use-restaurants';
import { pinnedRegionId } from '@/lib/auth/access';
import { useI18n } from '@/lib/i18n/provider';
import { algiersClock } from '@/lib/ops/restaurant-hours';
import { RESTAURANT_PAGE_SIZE } from '@/lib/services/restaurants';
import {
  confineRestaurantsToRegion,
  emptyRestaurantFilters,
  newRestaurantHref,
  parseListPage,
  parseRestaurantFilters,
  serializeRestaurantFilters,
  type RestaurantFilters,
} from '@/lib/url/restaurant-filters';
import { readRememberedSearch, writeRememberedSearch } from '@/lib/url/remembered-search';
import { PageHeader } from '@/components/ui/page-header';
import { ListEmpty, PagedList } from '@/components/ui/paged-list';
import { PlusIcon } from '@/components/icons';
import { RestaurantListRow } from './restaurant-row';
import { RestaurantsToolbar } from './restaurants-toolbar';

/**
 * The restaurant list — the dashboard's Stores page, for ops.
 *
 * Built like the orders board: the whole state is the query string, a staff account's
 * region is pinned where the URL is read, and a filter change goes back to page one.
 */
export function RestaurantsScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { region, role, account } = useAccess();
  const pinnedRegion = pinnedRegionId(region);
  const search = searchParams.toString();

  const filters = useMemo(
    () => confineRestaurantsToRegion(parseRestaurantFilters(new URLSearchParams(search)), pinnedRegion),
    [search, pinnedRegion],
  );
  const page = parseListPage(new URLSearchParams(search));

  // The filters survive leaving the page: every way back here — the sidebar, a breadcrumb,
  // a form's Save or Cancel, reloading `/restaurants` — arrives without a query string, and
  // that is answered with the list as it was last left. Read during render rather than in
  // an effect so the unfiltered list is never asked for on the way to the filtered one;
  // nothing under the i18n provider renders on the server, so there is no prerender for
  // this to disagree with.
  const memoryScope = `restaurants.${account?.objectId ?? ''}`;
  const restoreTo = search === '' ? readRememberedSearch(memoryScope) : null;
  const filtersSearch = serializeRestaurantFilters(filters, 1);

  useEffect(() => {
    if (restoreTo) router.replace(`${pathname}${restoreTo}`, { scroll: false });
    // The page is left out on purpose: page 4 of a list that has changed since is rarely
    // still a place worth coming back to.
    else writeRememberedSearch(memoryScope, filtersSearch);
  }, [restoreTo, filtersSearch, memoryScope, pathname, router]);

  const restaurantsQuery = useRestaurants(filters, page, !restoreTo);
  const citiesQuery = useCities();
  const categoriesQuery = useCategories();
  const now = useNow();
  const clock = useMemo(() => algiersClock(now), [now]);

  // Remembered before navigating, not after: taking off the last filter — clearing the
  // search, a segment back to its default, Clear all — lands on the bare URL, which would
  // otherwise restore the very filters that were just taken off.
  const navigate = useCallback(
    (next: RestaurantFilters, nextPage: number) => {
      writeRememberedSearch(memoryScope, serializeRestaurantFilters(next, 1));
      router.replace(`${pathname}${serializeRestaurantFilters(next, nextPage)}`, { scroll: false });
    },
    [memoryScope, pathname, router],
  );

  const applyFilters = useCallback(
    (patch: Partial<RestaurantFilters>) => navigate({ ...filters, ...patch }, 1),
    [filters, navigate],
  );
  const resetFilters = useCallback(
    () => navigate(confineRestaurantsToRegion(emptyRestaurantFilters(), pinnedRegion), 1),
    [navigate, pinnedRegion],
  );

  const rows = restaurantsQuery.data?.results ?? [];
  const hasFilters = !!(filters.query || filters.category || filters.status || filters.featuredOnly || (filters.region && !pinnedRegion));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={t('catalogue.eyebrow')}
        title={t('catalogue.list.title')}
        description={t('catalogue.list.subtitle')}
        actions={
          <Button variant="primary" size="md" onPress={() => router.push(newRestaurantHref())}>
            <PlusIcon aria-hidden className="size-4" />
            {t('catalogue.list.add')}
          </Button>
        }
      />

      <RestaurantsToolbar
        filters={filters}
        cities={citiesQuery.data}
        categories={categoriesQuery.data}
        pinnedRegion={pinnedRegion}
        onChange={applyFilters}
        onReset={resetFilters}
      />

      <PagedList
        status={restaurantsQuery.status}
        error={restaurantsQuery.error}
        isPlaceholderData={restaurantsQuery.isPlaceholderData}
        isFetching={restaurantsQuery.isFetching}
        page={page}
        pageSize={RESTAURANT_PAGE_SIZE}
        total={restaurantsQuery.data?.count ?? 0}
        rowCount={rows.length}
        errorTitle={t('catalogue.list.error')}
        onRetry={() => void restaurantsQuery.refetch()}
        onPageChange={(nextPage) => navigate(filters, nextPage)}
        empty={
          <ListEmpty
            title={t('catalogue.list.emptyTitle')}
            body={hasFilters ? t('catalogue.list.emptyFiltered') : t('catalogue.list.emptyBody')}
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
        {rows.map((restaurant) => (
          <RestaurantListRow key={restaurant.objectId} restaurant={restaurant} clock={clock} isAdmin={role === 'admin'} />
        ))}
      </PagedList>
    </div>
  );
}
