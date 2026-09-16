'use client';

import { useMemo, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAccess } from '@/hooks/use-access';
import { useCities } from '@/hooks/use-cities';
import { useManager, useManagerAccount } from '@/hooks/use-managers';
import { useNow } from '@/hooks/use-now';
import { pinnedRegionId } from '@/lib/auth/access';
import { splitPhones } from '@/lib/format';
import { useI18n } from '@/lib/i18n/provider';
import { MANAGER_STATUS_HINT_KEY, managerRestaurantState, toManagerView } from '@/lib/ops/managers';
import { algiersClock } from '@/lib/ops/restaurant-hours';
import { MANAGERS_PATH } from '@/lib/url/manager-filters';
import { ordersHref } from '@/lib/url/order-filters';
import { restaurantHref } from '@/lib/url/restaurant-filters';
import type { ManagerRow } from '@/types/manager';
import { CopyValue } from '@/components/ui/copy-value';
import { ExternalLinkIcon, MapPinIcon, PhoneIcon } from '@/components/icons';
import { DialogWarning, DriverAvatar, Tag } from '@/components/drivers/driver-bits';
import { Breadcrumbs, RestaurantStateChip, Thumb } from '@/components/restaurants/restaurant-bits';
import { ManagerActions } from './manager-actions';
import { ManagerGate, ManagerStatusChip, RestaurantLinkTag } from './manager-bits';

/** One manager: who they are, what ops can do about them, and the restaurant they run. */
export function ManagerDetailScreen() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';
  const { region } = useAccess();
  const pinnedRegion = pinnedRegionId(region);
  const query = useManager(id);
  const row = query.data;

  return (
    <ManagerGate
      status={id ? query.status : 'success'}
      error={query.error}
      isVisible={!!row && (!pinnedRegion || row.city?.objectId === pinnedRegion)}
      onRetry={() => void query.refetch()}
    >
      {row && <ManagerDetail row={row} />}
    </ManagerGate>
  );
}

function ManagerDetail({ row }: { row: ManagerRow }) {
  const { t, format } = useI18n();
  const now = useNow(30_000);
  const clock = useMemo(() => algiersClock(now), [now]);
  const citiesQuery = useCities();
  const manager = useMemo(() => toManagerView(row), [row]);
  const account = useManagerAccount(row.objectId, !manager.isProtected);

  const name = row.fullname ?? row.username ?? t('common.none');
  const regionId = row.city?.objectId ?? '';
  const regionName = citiesQuery.data?.find((city) => city.objectId === regionId)?.name;
  const phones = splitPhones(row.phone);
  const { restaurant } = manager;
  // Taking a manager off their restaurant also takes 'manager' out of `appType`; the page
  // stays, and says so.
  const isManagerAccount = row.appType?.includes('manager') ?? false;

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs items={[{ label: t('managers.list.title'), href: MANAGERS_PATH }, { label: name }]} />

      <header className="border-border/70 bg-surface rounded-card shadow-card flex flex-col gap-4 border p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <DriverAvatar picture={row.picture} name={name} className="text-h5 size-20" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-h3 font-bold tracking-tight">{name}</h1>
              <ManagerStatusChip status={manager.status} size="md" />
              {manager.isProtected && <Tag tone="warning">{t('drivers.row.staffAccount')}</Tag>}
              {!isManagerAccount && <Tag tone="muted">{t('managers.detail.notManager')}</Tag>}
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
            <p className="text-caption text-muted">{t(MANAGER_STATUS_HINT_KEY[manager.status])}</p>
          </div>
        </div>
        <ManagerActions manager={manager} variant="header" />
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
              {manager.isProtected
                ? t('common.none')
                : account.isPending
                  ? t('common.loading')
                  : account.isError
                    ? t('drivers.detail.emailFailed')
                    : (account.data?.email ?? t('common.none'))}
            </Item>
            <Item label={t('drivers.detail.region')}>{regionName ?? t('drivers.row.noRegion')}</Item>
            <Item label={t('drivers.detail.joined')}>{format.date(row.createdAt)}</Item>
            <Item label={t('managers.detail.updated')}>{format.dateTime(row.updatedAt)}</Item>
            <Item label={t('drivers.detail.id')}>
              <CopyValue value={row.objectId} prefix="" label={t('orders.detail.copyId')} />
            </Item>
          </dl>
        </Card>

        <Card title={t('managers.detail.restaurant')}>
          <div className="flex flex-col gap-3">
            {restaurant ? (
              <>
                <div className="flex items-center gap-3">
                  <Thumb picture={restaurant.picture} name={restaurant.name} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Link href={restaurantHref(restaurant.objectId)} className="text-body hover:text-link truncate font-bold">
                      {restaurant.name ?? t('common.none')}
                    </Link>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RestaurantStateChip state={managerRestaurantState(restaurant, clock)} />
                      <RestaurantLinkTag link={manager.link} />
                    </div>
                  </div>
                </div>
                {restaurant.address && <p className="text-caption text-muted">{restaurant.address}</p>}
                {manager.link === 'mismatch' && <DialogWarning>{t('managers.detail.mismatchHint')}</DialogWarning>}
                <div className="text-caption flex flex-wrap gap-x-4 gap-y-1">
                  <Link href={restaurantHref(restaurant.objectId)} className="text-link font-bold hover:underline">
                    {t('managers.detail.openRestaurant')}
                  </Link>
                  <Link
                    href={ordersHref('restaurant', restaurant.objectId)}
                    className="text-link inline-flex items-center gap-1 font-bold hover:underline"
                  >
                    {t('managers.detail.openOrders')}
                    <ExternalLinkIcon aria-hidden className="size-3.5" />
                  </Link>
                </div>
              </>
            ) : manager.link === 'missing' ? (
              <DialogWarning>{t('managers.detail.missingHint')}</DialogWarning>
            ) : (
              <p className="text-body text-muted">{t('managers.detail.noRestaurantHint')}</p>
            )}
          </div>
        </Card>
      </div>
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
