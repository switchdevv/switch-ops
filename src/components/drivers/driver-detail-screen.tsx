'use client';

import { useCallback, useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAccess } from '@/hooks/use-access';
import { useCities } from '@/hooks/use-cities';
import { useOngoingOrders } from '@/hooks/use-dispatch';
import { useDriver, useDriverAccount } from '@/hooks/use-drivers';
import { useNow } from '@/hooks/use-now';
import { useDispatchQueue } from '@/hooks/use-queue';
import { pinnedRegionId } from '@/lib/auth/access';
import { shortId, splitPhones } from '@/lib/format';
import { useI18n } from '@/lib/i18n/provider';
import {
  buildDriverList,
  carryingByDriver,
  DRIVER_STATUS_HINT_KEY,
  queuedByDriver,
  reviewCountOf,
} from '@/lib/ops/drivers';
import { mapHrefForOrder } from '@/lib/url/dispatch-params';
import {
  DRIVERS_PATH,
  parseDriverPage,
  serializeDriverPage,
  type DriverPage,
  type DriverRange,
} from '@/lib/url/driver-filters';
import { ordersHref } from '@/lib/url/order-filters';
import type { DriverRow } from '@/types/driver';
import { CopyValue } from '@/components/ui/copy-value';
import { Breadcrumbs } from '@/components/restaurants/restaurant-bits';
import { ExternalLinkIcon, MapPinIcon, PhoneIcon, QueueIcon } from '@/components/icons';
import { DriverActions } from './driver-actions';
import { DriverAvatar, DriverGate, DriverStatusChip, SeenText, Tag } from './driver-bits';
import { DriverDeliveries } from './driver-deliveries';

/**
 * One driver: who they are and whether they are working, what ops can do about it, what
 * they are doing right now, and what they delivered — with the money — in a period. The
 * period is in the URL (`?id=&range=`).
 */
export function DriverDetailScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const page = useMemo(() => parseDriverPage(new URLSearchParams(search)), [search]);
  const { region } = useAccess();
  const pinnedRegion = pinnedRegionId(region);
  const query = useDriver(page.id);
  const row = query.data;

  const changeRange = useCallback(
    (preset: DriverRange) =>
      router.replace(`${pathname}${serializeDriverPage({ id: page.id, preset })}`, { scroll: false }),
    [pathname, router, page.id],
  );

  return (
    <DriverGate
      status={page.id ? query.status : 'success'}
      error={query.error}
      isVisible={!!row && (!pinnedRegion || row.city?.objectId === pinnedRegion)}
      onRetry={() => void query.refetch()}
    >
      {row && <DriverDetail row={row} page={page} pinnedRegion={pinnedRegion} onRangeChange={changeRange} />}
    </DriverGate>
  );
}

function DriverDetail({
  row,
  page,
  pinnedRegion,
  onRangeChange,
}: {
  row: DriverRow;
  page: DriverPage;
  pinnedRegion: string;
  onRangeChange: (preset: DriverRange) => void;
}) {
  const { t, tCount, format } = useI18n();
  const now = useNow(15_000);
  // The driver's own region, so these share the map's cache whenever someone has that
  // region open there — and a staff account's is its pinned one anyway.
  const regionId = row.city?.objectId ?? '';
  const ordersQuery = useOngoingOrders(regionId, true);
  const queueQuery = useDispatchQueue(regionId, true);
  const citiesQuery = useCities();

  const driver = useMemo(
    () =>
      buildDriverList(
        [row],
        carryingByDriver(ordersQuery.data?.results ?? []),
        queuedByDriver(queueQuery.data ?? [], now),
        now,
      )[0],
    [row, ordersQuery.data, queueQuery.data, now],
  );
  // The email only exists on the `getUsers` read. A staff account's is not this screen's to
  // show, and not worth a cloud call for a card that can't be acted on.
  const account = useDriverAccount(row.objectId, !driver.isProtected);

  const name = row.fullname ?? row.username ?? t('common.none');
  const regionName = citiesQuery.data?.find((city) => city.objectId === regionId)?.name;
  const phones = splitPhones(row.phone);
  const reviews = reviewCountOf(row);
  const carryingId = driver.orderIds[0];
  const carrying = carryingId ? ordersQuery.data?.results.find((order) => order.objectId === carryingId) : undefined;

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs items={[{ label: t('drivers.list.title'), href: DRIVERS_PATH }, { label: name }]} />

      <header className="border-border/70 bg-surface rounded-card shadow-card flex flex-col gap-4 border p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <DriverAvatar picture={row.picture} name={name} className="text-h5 size-20" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-h3 font-bold tracking-tight">{name}</h1>
              <DriverStatusChip status={driver.status} size="md" />
              {driver.isProtected && <Tag tone="warning">{t('drivers.row.staffAccount')}</Tag>}
            </div>
            <div className="text-caption text-muted flex flex-wrap items-center gap-x-4 gap-y-1">
              {row.username && <span>@{row.username}</span>}
              {phones[0] && (
                <a href={`tel:${phones[0]}`} className="tabular hover:text-foreground inline-flex items-center gap-1">
                  <PhoneIcon aria-hidden className="size-3.5" />
                  {phones[0]}
                </a>
              )}
              <span className="inline-flex items-center gap-1">
                <MapPinIcon aria-hidden className="size-3.5" />
                {regionName ?? t('drivers.row.noRegion')}
              </span>
            </div>
            <p className="text-caption">
              <SeenText driver={driver} now={now} />
            </p>
          </div>
        </div>
        <DriverActions driver={driver} variant="header" />
      </header>

      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <Card title={t('drivers.detail.profile')}>
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <Item label={t('drivers.detail.username')}>{row.username ?? t('common.none')}</Item>
            <Item label={t('drivers.detail.phone')}>
              {phones.length > 0 ? (
                <span className="flex flex-col">
                  {phones.map((phone) => (
                    <a key={phone} href={`tel:${phone}`} className="tabular hover:text-link">
                      {phone}
                    </a>
                  ))}
                </span>
              ) : (
                t('common.none')
              )}
            </Item>
            <Item label={t('drivers.detail.email')}>
              {driver.isProtected
                ? t('common.none')
                : account.isPending
                  ? t('common.loading')
                  : account.isError
                    ? t('drivers.detail.emailFailed')
                    : (account.data?.email ?? t('common.none'))}
            </Item>
            <Item label={t('drivers.detail.region')}>{regionName ?? t('drivers.row.noRegion')}</Item>
            <Item label={t('drivers.detail.joined')}>{format.date(row.createdAt)}</Item>
            <Item label={t('drivers.detail.lastActive')}>{format.dateTime(row.updatedAt)}</Item>
            <Item label={t('drivers.detail.rating')}>
              {reviews > 0 && typeof row.driverRating === 'number'
                ? t('drivers.detail.ratingValue', {
                    rating: format.number(Math.round(row.driverRating * 10) / 10),
                    reviews: tCount('drivers.row.reviews', reviews),
                  })
                : t('drivers.row.noReviews')}
            </Item>
            <Item label={t('drivers.detail.ordersAccepted')}>{format.number(row.driverOrdersAccepted ?? 0)}</Item>
            <Item label={t('drivers.detail.id')}>
              <CopyValue value={row.objectId} prefix="" label={t('orders.detail.copyId')} />
            </Item>
          </dl>
        </Card>

        <Card title={t('drivers.detail.now')}>
          <div className="flex flex-col gap-3">
            <p className="text-caption text-muted">{t(DRIVER_STATUS_HINT_KEY[driver.status])}</p>

            {carryingId ? (
              <div className="border-border/70 bg-accent-soft/40 flex flex-col gap-1.5 rounded-xl border p-3">
                <p className="text-body font-bold">{t('drivers.detail.delivering', { order: shortId(carryingId) })}</p>
                {carrying?.restaurant?.name && (
                  <p className="text-caption text-muted">
                    {t('drivers.detail.from', { restaurant: carrying.restaurant.name })}
                  </p>
                )}
                <div className="text-caption flex flex-wrap gap-x-4 gap-y-1">
                  <Link href={mapHrefForOrder(carryingId)} className="text-link inline-flex items-center gap-1 font-bold hover:underline">
                    {t('drivers.detail.showOnMap')}
                  </Link>
                  <Link
                    href={ordersHref('objectId', carryingId)}
                    className="text-link inline-flex items-center gap-1 font-bold hover:underline"
                  >
                    {t('drivers.detail.openOrder')}
                    <ExternalLinkIcon aria-hidden className="size-3.5" />
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-body text-muted">{t('drivers.detail.notCarrying')}</p>
            )}

            {driver.queuedOrderIds.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-caption text-queued-soft-foreground inline-flex items-center gap-1.5 font-bold">
                  <QueueIcon aria-hidden className="size-3.5" />
                  {tCount('drivers.detail.queued', driver.queuedOrderIds.length)}
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {driver.queuedOrderIds.map((orderId) => (
                    <li key={orderId}>
                      <Link href={mapHrefForOrder(orderId)} className="focus-visible:ring-focus rounded outline-none focus-visible:ring-2">
                        <Tag tone="queued">#{shortId(orderId)}</Tag>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-caption text-faint">{t('drivers.detail.noQueue')}</p>
            )}

            <p className="text-micro text-faint">{t('drivers.detail.liveHint')}</p>
          </div>
        </Card>
      </div>

      <DriverDeliveries driver={driver} page={page} pinnedRegion={pinnedRegion} onRangeChange={onRangeChange} />
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-border/70 bg-surface rounded-card shadow-card flex flex-col gap-4 border p-4 sm:p-5">
      <h2 className="text-h6 font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-micro text-muted font-bold tracking-[0.1em] uppercase">{label}</dt>
      <dd className="text-body min-w-0 break-words">{children}</dd>
    </div>
  );
}
