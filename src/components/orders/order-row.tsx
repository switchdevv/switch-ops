'use client';

import { useId } from 'react';
import { useI18n } from '@/lib/i18n/provider';
import { shortId, splitPhones } from '@/lib/format';
import { basketSize, readBasket } from '@/lib/ops/basket';
import {
  isUnassignedDelivery,
  stageOf,
  STAGE_COLOR_VAR,
  STALE_AFTER_MS,
} from '@/lib/ops/order-status';
import type { OrderRow as OrderRowData } from '@/types/order';
import { StageChip } from '@/components/ui/stage-chip';
import { OrderDetail } from './order-detail';
import {
  BagIcon,
  BikeIcon,
  CardIcon,
  CashIcon,
  ChevronDownIcon,
  ClockIcon,
  PhoneIcon,
} from '@/components/icons';

/**
 * One order, collapsed to two lines and expandable in place.
 *
 * A wide table was the other option and is what the staff dashboard does: ten columns,
 * several of them stacks of `label: value` lines, scrolling sideways. It shows
 * everything and lets you compare nothing, because no two rows are the same height and
 * the money is off the right edge of the screen.
 *
 * Two lines at a fixed height means a page of orders is genuinely scannable — the
 * timestamps line up, the totals line up, and the colour rail down the left turns the
 * state of forty orders into a pattern. Everything else is one click away, in place,
 * without losing your position in the list.
 */
export function OrderRowItem({
  order,
  isExpanded,
  onToggle,
  now,
}: {
  order: OrderRowData;
  isExpanded: boolean;
  onToggle: () => void;
  /** A shared clock, so every row on the page agrees on what "now" is. */
  now: number;
}) {
  const { t, tCount, format } = useI18n();
  const detailId = useId();

  // Each order carries its own city, and each city its own currency — a platform-wide
  // symbol would be wrong the day Switch opens in a second country.
  const currency = order.city?.currency;

  const stage = stageOf(order);
  const isPickup = order.deliveryType === 'pickup';
  const TypeIcon = isPickup ? BagIcon : BikeIcon;
  const items = basketSize(readBasket(order));
  const needsDriver = isUnassignedDelivery(order);
  // The first of the customer's numbers — the rest, and the dialable links, are in the
  // detail. A row that showed 'x / y' would spend a third of its caption line on the
  // one customer in a hundred who registered two phones.
  const customerPhone = splitPhones(order.user?.phone)[0];

  const placedAt = new Date(order.createdAt).getTime();
  const isStale = stage === 'new' && Number.isFinite(placedAt) && now - placedAt > STALE_AFTER_MS;

  return (
    <li className="border-separator/70 border-b last:border-b-0">
      <div className="flex">
        {/* The rail is the row's whole state at a glance, and it survives being read
            out of the corner of an eye from across a desk. */}
        <span
          aria-hidden
          className="w-1 shrink-0"
          style={{ backgroundColor: stage ? STAGE_COLOR_VAR[stage] : 'var(--border)' }}
        />

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isExpanded}
          aria-controls={detailId}
          className="hover:bg-surface-secondary/60 focus-visible:ring-focus flex min-w-0 flex-1 items-center gap-2.5 px-3 py-3 text-start transition-colors outline-none focus-visible:-outline-offset-2 focus-visible:ring-2 focus-visible:ring-inset sm:gap-4 sm:px-4"
        >
          {/* When — 24h clock over a relative age, because "14:32" is what gets read
              aloud on the phone and "8 min ago" is what decides whether to worry. */}
          <span className="flex w-14 shrink-0 flex-col leading-tight sm:w-[4.5rem]">
            <span className="text-body tabular font-bold">{format.clock(order.createdAt)}</span>
            <span className="text-caption text-faint tabular">
              {format.relative(order.createdAt, now)}
            </span>
          </span>

          {/* Which */}
          <span className="hidden w-[6rem] shrink-0 flex-col leading-tight sm:flex">
            <span className="text-body tabular font-bold">#{shortId(order.objectId)}</span>
            <span className="text-caption text-faint flex items-center gap-1">
              <TypeIcon className="size-3.5" />
              {t(isPickup ? 'orders.type.pickup' : 'orders.type.delivery')}
            </span>
          </span>

          {/* Who — the flow of the order, restaurant to customer. Side by side once
              there is room for it; stacked on a phone, because two names sharing 150px
              truncate each other into "Le…" and "K…", which identifies nobody. */}
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="text-body flex min-w-0 flex-col sm:flex-row sm:items-center sm:gap-1.5">
              <span className="truncate font-bold">
                {order.restaurant?.name ?? t('common.none')}
              </span>
              <span aria-hidden className="text-faint hidden shrink-0 sm:inline">
                →
              </span>
              <span className="text-muted truncate">
                {order.user?.fullname ?? t('common.none')}
              </span>
            </span>
            <span className="text-caption mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {/* The number ops dials, on the row rather than one click into the detail:
                  the board is most often read with the customer already on the phone,
                  and matching a number by eye is what identifies their order.

                  Plain text, not the `tel:` link the detail uses — the whole row is a
                  single <button> and an anchor nested inside one is invalid HTML. */}
              {customerPhone && (
                <span className="text-muted tabular inline-flex items-center gap-1 whitespace-nowrap">
                  <PhoneIcon aria-hidden className="size-3.5" />
                  <span className="sr-only">{t('orders.row.customerPhone')}: </span>
                  {customerPhone}
                </span>
              )}

              {needsDriver ? (
                <span className="bg-danger-soft text-danger-soft-foreground rounded px-1.5 py-0.5 font-bold whitespace-nowrap">
                  {t('orders.row.noDriver')}
                </span>
              ) : order.driver ? (
                <span className="text-muted truncate">
                  {t('orders.row.driver')}: {order.driver.fullname ?? '—'}
                </span>
              ) : null}

              {isStale && (
                <span className="bg-warning-soft text-warning-soft-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold whitespace-nowrap">
                  <ClockIcon className="size-3" />
                  {t('orders.row.waiting', {
                    duration: format.elapsed(order.createdAt, now),
                  })}
                </span>
              )}

              {/* Kitchen said "bagged" while the order is still only confirmed — the
                  window in which someone rings up asking where the driver is. */}
              {order.isReady && stage === 'confirmed' && (
                <span className="bg-success-soft text-success-soft-foreground rounded px-1.5 py-0.5 font-bold whitespace-nowrap">
                  {t('orders.row.ready')}
                </span>
              )}
            </span>
          </span>

          {/* State */}
          <span className="hidden shrink-0 sm:block">
            <StageChip order={order} />
          </span>

          {/* How much */}
          <span className="flex w-[5.5rem] shrink-0 flex-col items-end leading-tight sm:w-[7rem]">
            <span className="text-body tabular font-bold">
              {format.money(order.options?.total, currency)}
            </span>
            <span className="text-caption text-faint flex items-center gap-1 whitespace-nowrap">
              {order.options?.paymentMethod === 'creditcards' ? (
                <CardIcon className="size-3.5" />
              ) : (
                <CashIcon className="size-3.5" />
              )}
              {items > 0 ? tCount('orders.row.items', items) : t('orders.row.noItems')}
            </span>
          </span>

          <ChevronDownIcon
            aria-hidden
            className={
              'text-faint size-4 shrink-0 transition-transform ' + (isExpanded ? 'rotate-180' : '')
            }
          />
          <span className="sr-only">
            {t(isExpanded ? 'orders.row.collapse' : 'orders.row.expand')}
          </span>
        </button>
      </div>

      {/* Mounted only while open. The detail resolves a basket and renders a dozen
          nested nodes; forty of those hidden behind `display: none` would make every
          refresh tick re-render work nobody is looking at. */}
      <div id={detailId}>
        {isExpanded && <OrderDetail order={order} currency={currency} />}
      </div>
    </li>
  );
}
