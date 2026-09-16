'use client';

import { useState } from 'react';
import Link from 'next/link';
import { shortId, splitPhones } from '@/lib/format';
import { useI18n } from '@/lib/i18n/provider';
import { DRIVER_STATUS_COLOR_VAR, reviewCountOf, type DriverView } from '@/lib/ops/drivers';
import { mapHrefForOrder } from '@/lib/url/dispatch-params';
import { driverHref } from '@/lib/url/driver-filters';
import { Notice, type NoticeValue } from '@/components/ui/notice';
import { BikeIcon, MapPinIcon, PhoneIcon, QueueIcon, StarIcon } from '@/components/icons';
import { DriverActions } from './driver-actions';
import { DriverAvatar, DriverStatusChip, SeenText, Tag } from './driver-bits';

/**
 * One driver: who and how to reach them on the left, what they are doing now under that,
 * and the status plus everything else behind ⋯ on the right. The name opens their page.
 *
 * The rail down the left is the status colour — the same device as the orders board, so a
 * page of the fleet reads as a pattern before a word of it is read.
 */
export function DriverListRow({
  driver,
  regionName,
  now,
}: {
  driver: DriverView;
  regionName: string | undefined;
  now: number;
}) {
  const { t, tCount, format } = useI18n();
  const [notice, setNotice] = useState<NoticeValue | null>(null);
  const { row } = driver;

  const name = row.fullname ?? row.username ?? t('common.none');
  // The first number only, as on the map's driver rows; the page lists the whole field.
  const phone = splitPhones(row.phone)[0];
  const reviews = reviewCountOf(row);
  const carrying = driver.orderIds[0];

  return (
    <li className="border-separator/70 border-b last:border-b-0">
      <div className="flex">
        <span aria-hidden className="w-1 shrink-0" style={{ backgroundColor: DRIVER_STATUS_COLOR_VAR[driver.status] }} />

        <div className="flex min-w-0 flex-1 flex-col gap-2 px-3 py-3 sm:px-4">
          <div className="flex items-center gap-3 sm:gap-4">
            <DriverAvatar picture={row.picture} name={name} />

            <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
              <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <Link
                  href={driverHref(driver.id)}
                  className="text-body hover:text-link focus-visible:ring-focus truncate rounded font-bold outline-none focus-visible:ring-2"
                >
                  {name}
                </Link>
                {row.username && <span className="text-caption text-faint truncate">@{row.username}</span>}
                {driver.isProtected && <Tag tone="warning">{t('drivers.row.staffAccount')}</Tag>}
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
                <span className="tabular inline-flex items-center gap-1 whitespace-nowrap">
                  <StarIcon aria-hidden className="size-3.5" />
                  {reviews > 0 && typeof row.driverRating === 'number'
                    ? `${t('drivers.row.rating', { rating: format.number(Math.round(row.driverRating * 10) / 10) })} · ${tCount('drivers.row.reviews', reviews)}`
                    : t('drivers.row.noReviews')}
                </span>
              </div>

              <div className="text-caption flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <span className="md:hidden">
                  <DriverStatusChip status={driver.status} />
                </span>
                <SeenText driver={driver} now={now} />
                {carrying && (
                  <Link href={mapHrefForOrder(carrying)} className="focus-visible:ring-focus rounded outline-none focus-visible:ring-2">
                    <Tag tone="accent">
                      <BikeIcon aria-hidden className="size-3" />
                      {t('drivers.row.carrying', { order: shortId(carrying) })}
                    </Tag>
                  </Link>
                )}
                {driver.queuedOrderIds.length > 0 && (
                  <Tag tone="queued">
                    <QueueIcon aria-hidden className="size-3" />
                    {tCount('drivers.row.queued', driver.queuedOrderIds.length)}
                  </Tag>
                )}
              </div>
            </div>

            <div className="hidden shrink-0 md:block">
              <DriverStatusChip status={driver.status} />
            </div>

            <div className="shrink-0">
              <DriverActions driver={driver} variant="row" onNotice={setNotice} />
            </div>
          </div>

          {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}
        </div>
      </div>
    </li>
  );
}
