'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { splitPhones } from '@/lib/format';
import { useI18n } from '@/lib/i18n/provider';
import { categoryName } from '@/lib/ops/catalogue';
import { toLatLng } from '@/lib/ops/dispatch';
import { commissionText, hasNoCommission, WEEKDAYS } from '@/lib/ops/restaurant-form';
import { formatClockTime } from '@/lib/ops/restaurant-hours';
import { managerHref } from '@/lib/url/manager-filters';
import type { RestaurantRow } from '@/types/restaurant';
import { CopyValue } from '@/components/ui/copy-value';
import { ExternalLinkIcon } from '@/components/icons';

/** Everything on file about a restaurant, laid out to read rather than to edit. */
export function RestaurantInfoPanel({ restaurant, isAdmin }: { restaurant: RestaurantRow; isAdmin: boolean }) {
  const { t, locale, format } = useI18n();
  const location = toLatLng(restaurant.location);
  const phones = splitPhones(restaurant.phone);
  const days = new Set(restaurant.workingDays ?? []);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <InfoCard title={t('catalogue.info.contact')}>
        <InfoRow label={t('catalogue.form.phone')}>
          {phones.length > 0 ? (
            <span className="flex flex-wrap gap-x-3">
              {phones.map((phone) => (
                <a key={phone} href={`tel:${phone}`} className="text-link tabular hover:underline">
                  {phone}
                </a>
              ))}
            </span>
          ) : (
            t('common.none')
          )}
        </InfoRow>
        <InfoRow label={t('catalogue.form.address')}>{restaurant.address || t('common.none')}</InfoRow>
        <InfoRow label={t('orders.filters.region')}>{restaurant.city?.name ?? t('common.none')}</InfoRow>
        <InfoRow label={t('catalogue.form.location')}>
          {location ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-link tabular inline-flex items-center gap-1 hover:underline"
            >
              {location.lat.toFixed(6)}, {location.lng.toFixed(6)}
              <ExternalLinkIcon aria-hidden className="size-3.5" />
            </a>
          ) : (
            <span className="text-danger">{t('catalogue.info.noLocation')}</span>
          )}
        </InfoRow>
        <InfoRow label={t('catalogue.info.manager')}>
          {restaurant.manager ? (
            <span className="flex flex-col">
              <Link href={managerHref(restaurant.manager.objectId)} className="text-link hover:underline">
                {restaurant.manager.fullname ?? restaurant.manager.username ?? t('common.none')}
              </Link>
              <CopyValue value={restaurant.manager.objectId} prefix="" label={t('orders.detail.copyId')} className="text-caption text-muted" />
            </span>
          ) : (
            t('catalogue.row.noManager')
          )}
        </InfoRow>
      </InfoCard>

      <InfoCard title={t('catalogue.form.hours')}>
        <InfoRow label={t('catalogue.info.opens')}>
          {restaurant.openTime && restaurant.closeTime
            ? t('dispatch.hours.schedule', {
                open: formatClockTime(restaurant.openTime),
                close: formatClockTime(restaurant.closeTime),
              })
            : t('dispatch.hours.unknown')}
        </InfoRow>
        <InfoRow label={t('catalogue.info.break')}>
          {restaurant.pauseStart && restaurant.pauseEnd
            ? t('dispatch.hours.breakWindow', {
                start: formatClockTime(restaurant.pauseStart),
                end: formatClockTime(restaurant.pauseEnd),
              })
            : t('catalogue.info.noBreak')}
        </InfoRow>
        <InfoRow label={t('catalogue.form.workingDays')}>
          <span className="flex flex-wrap gap-1">
            {WEEKDAYS.map((day) => (
              <span
                key={day}
                className={
                  'text-caption rounded px-1.5 py-0.5 capitalize ' +
                  (days.has(day) ? 'bg-accent-soft text-accent-soft-foreground font-bold' : 'text-faint line-through')
                }
              >
                {format.weekday(day)}
              </span>
            ))}
          </span>
        </InfoRow>
        <InfoRow label={t('catalogue.form.categories')}>
          {(restaurant.categories ?? []).map((category) => categoryName(category, locale)).join(' · ') || t('common.none')}
        </InfoRow>
      </InfoCard>

      <InfoCard title={t('catalogue.info.platform')}>
        <InfoRow label={t('catalogue.info.id')}>
          <CopyValue value={restaurant.objectId} prefix="" label={t('orders.detail.copyId')} />
        </InfoRow>
        <InfoRow label={t('catalogue.info.rating')}>
          {t('catalogue.reviews.summary', {
            rating: restaurant.rating ? format.number(Math.round(restaurant.rating * 10) / 10) : t('common.none'),
            count: format.number(restaurant.reviews ?? 0),
          })}
        </InfoRow>
        <InfoRow label={t('catalogue.info.orders')}>
          {t('catalogue.info.ordersValue', {
            total: format.number(restaurant.ordersTotal ?? 0),
            accepted: format.number(restaurant.ordersAccepted ?? 0),
          })}
        </InfoRow>
        {isAdmin && (
          <InfoRow label={t('catalogue.form.commission')}>
            {hasNoCommission(restaurant) ? (
              <span className="text-warning-soft-foreground font-bold">{t('catalogue.row.noCommission')}</span>
            ) : (
              `${commissionText(restaurant.fee)} %`
            )}
          </InfoRow>
        )}
        <InfoRow label={t('catalogue.info.created')}>{format.dateTime(restaurant.createdAt)}</InfoRow>
        <InfoRow label={t('catalogue.info.updated')}>{format.dateTime(restaurant.updatedAt)}</InfoRow>
      </InfoCard>

      <InfoCard title={t('catalogue.form.description')}>
        <p className="text-body whitespace-pre-line">{restaurant.description || t('catalogue.info.noDescription')}</p>
      </InfoCard>
    </div>
  );
}

function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-border/70 bg-surface rounded-card shadow-card flex flex-col gap-3 border p-4 sm:p-5">
      <h2 className="text-micro text-muted border-separator/70 border-b pb-1.5 font-bold tracking-[0.14em] uppercase">
        {title}
      </h2>
      <dl className="flex flex-col gap-2.5">{children}</dl>
    </section>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="text-body min-w-0 break-words">{children}</dd>
    </div>
  );
}
