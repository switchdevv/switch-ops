'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { initials, splitPhones } from '@/lib/format';
import { isOpen } from '@/lib/ops/order-status';
import { mapHrefForOrder } from '@/lib/url/dispatch-params';
import type { CurrencyCode } from '@/types/city';
import type { OrderRow } from '@/types/order';
import { CopyValue } from '@/components/ui/copy-value';
import {
  BikeIcon,
  MapPinIcon,
  NoteIcon,
  PhoneIcon,
  StoreIcon,
  UserIcon,
} from '@/components/icons';
import { OrderActions } from './order-actions';
import { OrderBasket, OrderPayment } from './order-contents';

/**
 * Everything the backend knows about one order, laid out as three panels.
 *
 * Grouped by the question being asked rather than by where the fields live on the row:
 * *who* to call, *what* was ordered, and *what it cost*. The staff dashboard renders
 * the same data as two crowded table cells of `key: value` lines, which is complete but
 * has to be read start to finish; a dispatcher with a customer on the phone needs to
 * land on one of those three things directly.
 *
 * The basket is the panel that varies — one line or fifteen, each with variants and
 * supplements — so it gets the widest column, and the other two are sized to the widest
 * thing they actually contain: a pair of phone numbers, and a column of money.
 */
export function OrderDetail({
  order,
  currency,
}: {
  order: OrderRow;
  currency: CurrencyCode | undefined;
}) {
  const { t } = useI18n();
  const options = order.options;
  const isPickup = order.deliveryType === 'pickup';

  return (
    <div className="border-separator/70 bg-surface-secondary/40 flex flex-col gap-4 border-t p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <OrderActions order={order} className="min-w-0 flex-1" />
        {/* Only while the order is still moving: the live map holds open orders, and a link
            that lands on "not on the map any more" teaches people not to trust the link. */}
        {isOpen(order) && (
          <Link
            href={mapHrefForOrder(order.objectId)}
            className="text-caption text-link hover:underline focus-visible:ring-focus inline-flex w-fit items-center gap-1.5 rounded py-1.5 font-bold outline-none focus-visible:ring-2"
          >
            <MapPinIcon aria-hidden className="size-4" />
            {t('orders.detail.showOnMap')}
          </Link>
        )}
      </div>

      {options?.note && (
        // Above the panels, full width, in warning tint: this is a free-text
        // instruction from the customer ("call from downstairs", "no onions") and it is
        // the single field most likely to cause a redelivery if it goes unread.
        <div className="bg-warning-soft text-warning-soft-foreground flex items-start gap-2.5 rounded-xl p-3">
          <NoteIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p className="text-body">
            <span className="font-bold">{t('orders.detail.orderNote')}: </span>
            {options.note}
          </p>
        </div>
      )}

      {/* `items-start` rather than the grid's default stretch: a four-line payment panel
          padded out to the height of a fifteen-line basket is mostly empty box. */}
      <div className="grid items-start gap-4 lg:grid-cols-12">
        <Panel title={t('orders.detail.people')} className="lg:col-span-4">
          <div className="flex flex-col gap-2.5">
            <PartyCard
              icon={<StoreIcon className="size-4" />}
              role={t('orders.detail.restaurant')}
              name={order.restaurant?.name}
              phone={order.restaurant?.phone}
              objectId={order.restaurant?.objectId}
              extra={
                order.restaurant?.manager && (
                  <span className="text-caption text-muted flex items-center gap-1">
                    {t('orders.detail.manager')}
                    <CopyValue
                      value={order.restaurant.manager.objectId}
                      label={t('orders.detail.copyId')}
                      className="text-caption"
                    />
                  </span>
                )
              }
            />
            <PartyCard
              icon={<UserIcon className="size-4" />}
              role={t('orders.detail.customer')}
              name={order.user?.fullname}
              phone={order.user?.phone}
              objectId={order.user?.objectId}
            />
            {/* Pickups have no driver by design, so the empty slot is omitted rather
                than rendered as a permanently unfillable gap. */}
            {!isPickup && (
              <PartyCard
                icon={<BikeIcon className="size-4" />}
                role={t('orders.detail.driver')}
                name={order.driver?.fullname}
                phone={order.driver?.phone}
                objectId={order.driver?.objectId}
                emptyLabel={t('orders.detail.unassigned')}
              />
            )}
          </div>
        </Panel>

        <Panel title={t('orders.detail.basket')} className="lg:col-span-5">
          <OrderBasket order={order} currency={currency} />
        </Panel>

        <Panel title={t('orders.detail.payment')} className="lg:col-span-3">
          <OrderPayment order={order} currency={currency} />
        </Panel>
      </div>
    </div>
  );
}

function Panel({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`border-border/70 bg-surface rounded-xl border p-4 ${className ?? ''}`}>
      <h3 className="text-micro text-muted mb-3 font-bold tracking-[0.16em] uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function PartyCard({
  icon,
  role,
  name,
  phone,
  objectId,
  emptyLabel,
  extra,
}: {
  icon: ReactNode;
  role: string;
  name: string | undefined;
  phone: string | undefined;
  objectId: string | undefined;
  /** Shown instead of the name when the party isn't set — an unassigned driver. */
  emptyLabel?: string;
  extra?: ReactNode;
}) {
  const { t } = useI18n();
  const phones = splitPhones(phone);
  const isEmpty = !objectId;

  return (
    <div className="flex items-start gap-3">
      <span
        className={
          'grid size-9 shrink-0 place-items-center rounded-xl text-[11px] font-bold ' +
          (isEmpty ? 'bg-surface-tertiary text-faint' : 'bg-accent-soft text-accent-soft-foreground')
        }
        aria-hidden
      >
        {isEmpty ? icon : initials(name)}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-micro text-faint flex items-center gap-1 font-bold tracking-[0.1em] uppercase">
          {role}
        </span>
        {isEmpty ? (
          <p className="text-body text-muted">{emptyLabel ?? t('common.none')}</p>
        ) : (
          <>
            <p className="text-body truncate font-bold">{name ?? t('common.none')}</p>
            <div className="text-caption text-muted mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5">
              {phones.length > 0 ? (
                // A real `tel:` link, not text: on a laptop it hands off to the softphone
                // the team already has open, and on a phone it dials.
                <a
                  href={`tel:${phones[0].replace(/\s+/g, '')}`}
                  className="text-link hover:underline inline-flex items-center gap-1 tabular"
                >
                  <PhoneIcon className="size-3.5" />
                  {phones.join(' / ')}
                </a>
              ) : (
                <span className="text-faint">{t('orders.detail.noPhone')}</span>
              )}
              <CopyValue value={objectId} label={t('orders.detail.copyId')} />
            </div>
            {extra}
          </>
        )}
      </div>
    </div>
  );
}
