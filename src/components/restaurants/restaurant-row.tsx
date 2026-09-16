'use client';

import { useState } from 'react';
import Link from 'next/link';
import { splitPhones } from '@/lib/format';
import { useI18n } from '@/lib/i18n/provider';
import { categoryName, restaurantState } from '@/lib/ops/catalogue';
import { hasNoCommission } from '@/lib/ops/restaurant-form';
import type { WallClock } from '@/lib/ops/restaurant-hours';
import { restaurantHref } from '@/lib/url/restaurant-filters';
import type { RestaurantRow as RestaurantRowData } from '@/types/restaurant';
import { Notice, type NoticeValue } from '@/components/ui/notice';
import { MapPinIcon, PhoneIcon, StarIcon, UserIcon } from '@/components/icons';
import { RestaurantActions } from './restaurant-actions';
import { RestaurantStateChip, Tag, Thumb } from './restaurant-bits';

/**
 * One restaurant: who and where on the left, whether customers can order from it now in
 * the middle, and Pause (with everything else behind ⋯) on the right. The name opens the
 * restaurant's page, where its menus are.
 */
export function RestaurantListRow({
  restaurant,
  clock,
  isAdmin,
}: {
  restaurant: RestaurantRowData;
  clock: WallClock;
  isAdmin: boolean;
}) {
  const { t, locale, format } = useI18n();
  const [notice, setNotice] = useState<NoticeValue | null>(null);
  const state = restaurantState(restaurant, clock);
  const phone = splitPhones(restaurant.phone)[0];
  const categories = (restaurant.categories ?? []).map((category) => categoryName(category, locale));

  return (
    <li className="border-separator/70 flex flex-col gap-2 border-b px-3 py-3 last:border-b-0 sm:px-4">
      <div className="flex items-center gap-3 sm:gap-4">
        <Thumb picture={restaurant.picture} name={restaurant.name} />

        <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={restaurantHref(restaurant.objectId)}
              className="text-body hover:text-link focus-visible:ring-focus truncate rounded font-bold outline-none focus-visible:ring-2"
            >
              {restaurant.name ?? t('common.none')}
            </Link>
            {restaurant.isFeatured && (
              <Tag tone="accent">
                <StarIcon aria-hidden className="size-3" />
                {t('catalogue.row.featured')}
              </Tag>
            )}
            {isAdmin && hasNoCommission(restaurant) && <Tag tone="warning">{t('catalogue.row.noCommission')}</Tag>}
          </div>

          <div className="text-caption text-muted flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPinIcon aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">
                {[restaurant.city?.name, restaurant.address].filter(Boolean).join(' · ') || t('common.none')}
              </span>
            </span>
            {phone && (
              <span className="tabular inline-flex items-center gap-1 whitespace-nowrap">
                <PhoneIcon aria-hidden className="size-3.5" />
                {phone}
              </span>
            )}
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <UserIcon aria-hidden className="size-3.5" />
              {restaurant.manager?.fullname ?? t('catalogue.row.noManager')}
            </span>
          </div>

          {categories.length > 0 && (
            <p className="text-caption text-faint truncate">{categories.join(' · ')}</p>
          )}
        </div>

        <div className="hidden shrink-0 flex-col items-end gap-1 md:flex">
          <RestaurantStateChip state={state} />
          <span className="text-caption text-faint tabular inline-flex items-center gap-1">
            <StarIcon aria-hidden className="size-3" />
            {restaurant.rating ? format.number(Math.round(restaurant.rating * 10) / 10) : t('common.none')}
            {' · '}
            {t('catalogue.row.orders', { count: format.number(restaurant.ordersTotal ?? 0) })}
          </span>
        </div>

        <div className="shrink-0">
          <RestaurantActions restaurant={restaurant} variant="row" onNotice={setNotice} />
        </div>
      </div>

      <div className="md:hidden">
        <RestaurantStateChip state={state} />
      </div>

      {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}
    </li>
  );
}
