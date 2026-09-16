'use client';

import { useState } from 'react';
import Link from 'next/link';
import { splitPhones } from '@/lib/format';
import { useI18n } from '@/lib/i18n/provider';
import { MANAGER_STATUS_COLOR_VAR, managerRestaurantState, type ManagerView } from '@/lib/ops/managers';
import type { WallClock } from '@/lib/ops/restaurant-hours';
import { managerHref } from '@/lib/url/manager-filters';
import { restaurantHref } from '@/lib/url/restaurant-filters';
import { Notice, type NoticeValue } from '@/components/ui/notice';
import { MapPinIcon, PhoneIcon, StoreIcon } from '@/components/icons';
import { DriverAvatar, Tag } from '@/components/drivers/driver-bits';
import { RestaurantStateChip } from '@/components/restaurants/restaurant-bits';
import { ManagerActions } from './manager-actions';
import { ManagerStatusChip, RestaurantLinkTag } from './manager-bits';

/**
 * One manager: who and how to reach them, the restaurant they run and whether customers can
 * order from it right now, then their status and everything else behind ⋯. The rail down the
 * left is the status colour, as on the Drivers list.
 */
export function ManagerListRow({
  manager,
  regionName,
  clock,
}: {
  manager: ManagerView;
  regionName: string | undefined;
  clock: WallClock;
}) {
  const { t } = useI18n();
  const [notice, setNotice] = useState<NoticeValue | null>(null);
  const { row, restaurant } = manager;

  const name = row.fullname ?? row.username ?? t('common.none');
  const phone = splitPhones(row.phone)[0];

  return (
    <li className="border-separator/70 border-b last:border-b-0">
      <div className="flex">
        <span aria-hidden className="w-1 shrink-0" style={{ backgroundColor: MANAGER_STATUS_COLOR_VAR[manager.status] }} />

        <div className="flex min-w-0 flex-1 flex-col gap-2 px-3 py-3 sm:px-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <DriverAvatar picture={row.picture} name={name} />

            <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <Link
                  href={managerHref(manager.id)}
                  className="text-body hover:text-link focus-visible:ring-focus truncate rounded font-bold outline-none focus-visible:ring-2"
                >
                  {name}
                </Link>
                {row.username && <span className="text-caption text-faint truncate">@{row.username}</span>}
                {manager.isProtected && <Tag tone="warning">{t('drivers.row.staffAccount')}</Tag>}
              </div>

              <div className="text-caption text-muted flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
                {phone && (
                  <a
                    href={`tel:${phone}`}
                    aria-label={t('drivers.row.call', { phone })}
                    className="tabular hover:text-foreground inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <PhoneIcon aria-hidden className="size-3.5" />
                    {phone}
                  </a>
                )}
                <span className="inline-flex min-w-0 items-center gap-1">
                  <MapPinIcon aria-hidden className="size-3.5 shrink-0" />
                  <span className="truncate">{regionName ?? t('drivers.row.noRegion')}</span>
                </span>
              </div>

              <div className="text-caption flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="md:hidden">
                  <ManagerStatusChip status={manager.status} />
                </span>
                {restaurant ? (
                  <>
                    <Link
                      href={restaurantHref(restaurant.objectId)}
                      className="hover:text-link focus-visible:ring-focus inline-flex min-w-0 items-center gap-1 rounded font-bold outline-none focus-visible:ring-2"
                    >
                      <StoreIcon aria-hidden className="size-3.5 shrink-0" />
                      <span className="truncate">{restaurant.name ?? t('common.none')}</span>
                    </Link>
                    <RestaurantStateChip state={managerRestaurantState(restaurant, clock)} />
                  </>
                ) : (
                  <span className="text-faint">{t('managers.row.noRestaurant')}</span>
                )}
                <RestaurantLinkTag link={manager.link} />
              </div>
            </div>

            <div className="hidden shrink-0 md:block">
              <ManagerStatusChip status={manager.status} />
            </div>

            <div className="shrink-0">
              <ManagerActions manager={manager} variant="row" onNotice={setNotice} />
            </div>
          </div>

          {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}
        </div>
      </div>
    </li>
  );
}
