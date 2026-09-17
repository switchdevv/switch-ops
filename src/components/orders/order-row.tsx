'use client';

import { useId, useState } from 'react';
import { useI18n } from '@/lib/i18n/provider';
import { shortId, splitPhones } from '@/lib/format';
import { basketSize, readBasket } from '@/lib/ops/basket';
import { showsCalls } from '@/lib/ops/order-calls';
import { canConfirm } from '@/lib/ops/order-edit';
import {
  isUnassignedDelivery,
  stageOf,
  STAGE_COLOR_VAR,
  STALE_AFTER_MS,
} from '@/lib/ops/order-status';
import { retryAtOf, type QueueSlot } from '@/lib/ops/queue';
import type { OrderRow as OrderRowData } from '@/types/order';
import { PickupBadge } from '@/components/ui/pickup-badge';
import { StageChip } from '@/components/ui/stage-chip';
import { CallChips } from './order-calls';
import { OrderDetail } from './order-detail';
import {
  BikeIcon,
  CardIcon,
  CashIcon,
  ChevronDownIcon,
  ClockIcon,
  PhoneIcon,
  QueueIcon,
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
  queueSlot,
}: {
  order: OrderRowData;
  isExpanded: boolean;
  onToggle: () => void;
  /** A shared clock, so every row on the page agrees on what "now" is. */
  now: number;
  /** Its place in a driver's queue, when ops have lined it up behind one. */
  queueSlot?: QueueSlot;
}) {
  const { t, tCount, format } = useI18n();
  const detailId = useId();

  // Each order carries its own city, and each city its own currency — a platform-wide
  // symbol would be wrong the day Switch opens in a second country.
  const currency = order.city?.currency;

  const stage = stageOf(order);
  const isPickup = order.deliveryType === 'pickup';
  const items = basketSize(readBasket(order));
  const needsDriver = isUnassignedDelivery(order);
  // The first of the customer's numbers — the rest, and the dialable links, are in the
  // detail. A row that showed 'x / y' would spend a third of its caption line on the
  // one customer in a hundred who registered two phones.
  const customerPhone = splitPhones(order.user?.phone)[0];

  const placedAt = new Date(order.createdAt).getTime();
  const isStale = stage === 'new' && Number.isFinite(placedAt) && now - placedAt > STALE_AFTER_MS;

  const hasCalls = showsCalls(order);

  // Marking the restaurant's call done from a chip opens the row on its Confirm step —
  // confirming is what comes next (see OrderActions). A count rather than a flag, so a
  // second launch on a row already open still asks; closing the row drops the request, so
  // opening it again later shows the order as it is.
  const [confirmRequest, setConfirmRequest] = useState(0);
  const toggle = () => {
    if (isExpanded) setConfirmRequest(0);
    onToggle();
  };
  const openToConfirm = canConfirm(order)
    ? () => {
        setConfirmRequest((count) => count + 1);
        if (!isExpanded) onToggle();
      }
    : undefined;

  return (
    <li className="border-separator/70 border-b last:border-b-0">
      <div className="group relative flex">
        {/* The whole row opens the order, but the call chips on it are buttons of their
            own, and a <button> can't hold another. So the row's button lies under the
            content, stretched across it, and the content lets every click fall through
            to it except the ones on the chips. */}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={isExpanded}
          aria-controls={detailId}
          aria-label={`${t(isExpanded ? 'orders.row.collapse' : 'orders.row.expand')}: #${shortId(order.objectId)} · ${order.restaurant?.name ?? t('common.none')} → ${order.user?.fullname ?? t('common.none')}`}
          className="group-hover:bg-surface-secondary/60 focus-visible:ring-focus absolute inset-0 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
        />

        {/* The rail is the row's whole state at a glance, and it survives being read
            out of the corner of an eye from across a desk. */}
        <span
          aria-hidden
          className="relative w-1 shrink-0"
          style={{ backgroundColor: stage ? STAGE_COLOR_VAR[stage] : 'var(--border)' }}
        />

        <div className="pointer-events-none relative flex min-w-0 flex-1 items-center gap-2.5 px-3 py-3 text-start sm:gap-4 sm:px-4">
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
            {/* Delivery is the default and stays quiet; a pickup is the exception ops must
                not treat like one, so it carries the loud mark. */}
            {isPickup ? (
              <PickupBadge className="mt-0.5" />
            ) : (
              <span className="text-caption text-faint flex items-center gap-1">
                <BikeIcon className="size-3.5" />
                {t('orders.type.delivery')}
              </span>
            )}
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
              {/* On a phone the column above is hidden, and the mark with it. */}
              {isPickup && <PickupBadge className="sm:hidden" />}

              {/* The calls lead this line until the row is wide enough for their own
                  column (below). */}
              {hasCalls && (
                <CallChips order={order} onLaunched={openToConfirm} className="pointer-events-auto xl:hidden" />
              )}

              {/* The number ops dials, on the row rather than one click into the detail:
                  the board is most often read with the customer already on the phone,
                  and matching a number by eye is what identifies their order.

                  Plain text, not the `tel:` link the detail uses: a click anywhere on the
                  row opens it, and one that dialled instead would be a surprise. */}
              {customerPhone && (
                <span className="text-muted tabular inline-flex items-center gap-1 whitespace-nowrap">
                  <PhoneIcon aria-hidden className="size-3.5" />
                  <span className="sr-only">{t('orders.row.customerPhone')}: </span>
                  {customerPhone}
                </span>
              )}

              {/* A delivery with no driver on the row, but one chosen: lined up behind a
                  driver on another job. Handled, so not red — the same violet the live
                  map paints it. */}
              {needsDriver && queueSlot?.kind === 'lapsed' ? (
                // Sent from a queue and never taken: back to needing a driver, so red —
                // but saying who it went to, which is the first thing ops will ask.
                <span className="bg-danger-soft text-danger-soft-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold whitespace-nowrap">
                  <QueueIcon aria-hidden className="size-3" />
                  {t('orders.row.lapsed', { driver: queueSlot.entry.driver?.fullname ?? t('common.none') })}
                </span>
              ) : needsDriver && queueSlot ? (
                <span className="bg-queued-soft text-queued-soft-foreground inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold whitespace-nowrap">
                  <QueueIcon aria-hidden className="size-3" />
                  {queueSlot.kind === 'offered'
                    ? t('orders.row.offered', {
                        driver: queueSlot.entry.driver?.fullname ?? t('common.none'),
                        ago: format.relative(queueSlot.entry.dispatchedAt?.iso ?? queueSlot.entry.claimedAt?.iso, now),
                      })
                    : t((retryAtOf(queueSlot.entry) ?? 0) > now ? 'orders.row.retrying' : 'orders.row.queued', {
                        driver: queueSlot.entry.driver?.fullname ?? t('common.none'),
                      })}
                </span>
              ) : needsDriver ? (
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

          {/* Calls, beside the state once there is room. A fixed width, empty when an
              order has no calls to show, so the column lines up down the page. */}
          <span className="hidden w-[6rem] shrink-0 justify-end xl:flex">
            {hasCalls && <CallChips order={order} onLaunched={openToConfirm} className="pointer-events-auto" />}
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
        </div>
      </div>

      {/* Mounted only while open. The detail resolves a basket and renders a dozen
          nested nodes; forty of those hidden behind `display: none` would make every
          refresh tick re-render work nobody is looking at. */}
      <div id={detailId}>
        {isExpanded && <OrderDetail order={order} currency={currency} confirmRequest={confirmRequest} />}
      </div>
    </li>
  );
}
