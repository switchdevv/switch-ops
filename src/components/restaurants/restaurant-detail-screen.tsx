'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAccess } from '@/hooks/use-access';
import { useNow } from '@/hooks/use-now';
import { useRestaurant } from '@/hooks/use-restaurants';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { useI18n } from '@/lib/i18n/provider';
import { categoryName, restaurantState } from '@/lib/ops/catalogue';
import { hasNoCommission } from '@/lib/ops/restaurant-form';
import { algiersClock } from '@/lib/ops/restaurant-hours';
import {
  parseRestaurantView,
  RESTAURANT_TABS,
  RESTAURANTS_PATH,
  serializeRestaurantView,
  type RestaurantTab,
  type RestaurantView,
} from '@/lib/url/restaurant-filters';
import type { RestaurantRow } from '@/types/restaurant';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { MapPinIcon, PhoneIcon, StarIcon, UserIcon } from '@/components/icons';
import { CatalogueGate } from './catalogue-gate';
import { MenusPanel } from './menus-panel';
import { Breadcrumbs, RestaurantStateChip, Tag, Thumb } from './restaurant-bits';
import { RestaurantActions } from './restaurant-actions';
import { RestaurantInfoPanel } from './restaurant-info-panel';
import { ReviewsPanel } from './reviews-panel';

const TAB_LABEL: Record<RestaurantTab, MessageKey> = {
  menus: 'catalogue.tabs.menus',
  reviews: 'catalogue.tabs.reviews',
  info: 'catalogue.tabs.info',
};

/**
 * One restaurant: who it is and whether it is taking orders, what ops can do to it, and
 * three tabs — its menus (the default, because menus are what gets edited most), its
 * reviews, and everything on file. The tab, its filters and its page are in the URL.
 */
export function RestaurantDetailScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = useMemo(() => parseRestaurantView(new URLSearchParams(searchParams.toString())), [searchParams]);
  const query = useRestaurant(view.id);
  const restaurant = query.data;

  const navigate = useCallback(
    (next: RestaurantView) => router.replace(`${pathname}${serializeRestaurantView(next)}`, { scroll: false }),
    [pathname, router],
  );

  return (
    <CatalogueGate
      status={view.id ? query.status : 'success'}
      error={query.error}
      exists={!!restaurant}
      regionId={restaurant?.city?.objectId}
      onRetry={() => void query.refetch()}
    >
      {restaurant && <RestaurantDetail restaurant={restaurant} view={view} onNavigate={navigate} />}
    </CatalogueGate>
  );
}

function RestaurantDetail({
  restaurant,
  view,
  onNavigate,
}: {
  restaurant: RestaurantRow;
  view: RestaurantView;
  onNavigate: (view: RestaurantView) => void;
}) {
  const { t, locale } = useI18n();
  const { role } = useAccess();
  const isAdmin = role === 'admin';
  const now = useNow();
  const state = restaurantState(restaurant, algiersClock(now));

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs
        items={[{ label: t('catalogue.list.title'), href: RESTAURANTS_PATH }, { label: restaurant.name ?? t('common.none') }]}
      />

      <header className="border-border/70 bg-surface rounded-card shadow-card flex flex-col gap-4 border p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Thumb picture={restaurant.picture} name={restaurant.name} className="size-20 rounded-2xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-h3 font-bold tracking-tight">{restaurant.name ?? t('common.none')}</h1>
              <RestaurantStateChip state={state} size="md" />
              {restaurant.isFeatured && (
                <Tag tone="accent">
                  <StarIcon aria-hidden className="size-3" />
                  {t('catalogue.row.featured')}
                </Tag>
              )}
              {isAdmin && hasNoCommission(restaurant) && <Tag tone="warning">{t('catalogue.row.noCommission')}</Tag>}
            </div>
            <div className="text-caption text-muted flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1">
                <MapPinIcon aria-hidden className="size-3.5" />
                {[restaurant.city?.name, restaurant.address].filter(Boolean).join(' · ') || t('common.none')}
              </span>
              {restaurant.phone && (
                <span className="tabular inline-flex items-center gap-1">
                  <PhoneIcon aria-hidden className="size-3.5" />
                  {restaurant.phone}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <UserIcon aria-hidden className="size-3.5" />
                {restaurant.manager?.fullname ?? t('catalogue.row.noManager')}
              </span>
            </div>
            {(restaurant.categories ?? []).length > 0 && (
              <p className="text-caption text-faint">
                {(restaurant.categories ?? []).map((category) => categoryName(category, locale)).join(' · ')}
              </p>
            )}
          </div>
        </div>
        <RestaurantActions restaurant={restaurant} variant="header" />
      </header>

      <SegmentedControl
        label={t('catalogue.tabs.label')}
        options={RESTAURANT_TABS.map((tab) => ({ key: tab, label: t(TAB_LABEL[tab]) }))}
        value={view.tab}
        onChange={(tab) => onNavigate({ ...view, tab, page: 1, menus: { query: '', status: '' }, reviews: { rating: '' } })}
      />

      {view.tab === 'menus' && (
        <MenusPanel
          restaurant={restaurant}
          filters={view.menus}
          page={view.page}
          onFiltersChange={(menus) => onNavigate({ ...view, menus, page: 1 })}
          onPageChange={(page) => onNavigate({ ...view, page })}
        />
      )}
      {view.tab === 'reviews' && (
        <ReviewsPanel
          restaurant={restaurant}
          filters={view.reviews}
          page={view.page}
          onFiltersChange={(reviews) => onNavigate({ ...view, reviews, page: 1 })}
          onPageChange={(page) => onNavigate({ ...view, page })}
        />
      )}
      {view.tab === 'info' && <RestaurantInfoPanel restaurant={restaurant} isAdmin={isAdmin} />}
    </div>
  );
}
