'use client';

import type { ReactNode } from 'react';
import { shortId, splitPhones } from '@/lib/format';
import { useI18n } from '@/lib/i18n/provider';
import { basketSize, readBasket } from '@/lib/ops/basket';
import {
  distanceMeters,
  DRIVER_COLOR_VAR,
  DRIVER_STATE_LABEL_KEY,
  DRIVER_STATES,
  isLate,
  ORDER_PHASES,
  PHASE_COLOR_VAR,
  PHASE_LABEL_KEY,
  type DispatchDriver,
  type DispatchModel,
  type DispatchOrder,
  type DispatchRestaurant,
  type DriverState,
  type OrderPhase,
} from '@/lib/ops/dispatch';
import { canMarkCalls } from '@/lib/ops/order-calls';
import { retryAtOf, sentAtOf } from '@/lib/ops/queue';
import { CallChips } from '@/components/orders/order-calls';
import { PickupBadge } from '@/components/ui/pickup-badge';
import { ArrowRightIcon, ClockIcon, InboxIcon, PhoneIcon, QueueIcon, RefreshIcon } from '@/components/icons';
import { HoursText } from './restaurant-hours-text';

/** How many of a driver's queued orders their row names before "+N". */
const QUEUE_PREVIEW = 2;

/** A driver's name for a label, from the model when they are on it, else from the row
 * the queue read included. */
export function driverNameOf(model: DispatchModel, driverId: string, fallback?: string): string | undefined {
  const row = model.driversById.get(driverId)?.row;
  return row?.fullname ?? row?.username ?? fallback;
}

/**
 * The queue: every open order grouped by what it needs, every driver grouped by whether
 * they can take one, and the restaurants those orders are waiting on.
 *
 * Ordered by urgency and then by age, so the row at the top is always the one that has
 * been waiting longest for the thing ops is here to do. Rows are deliberately three
 * lines — time, who, and the tags that decide whether to act — because a dispatcher
 * scans this list far more often than they read it.
 */

export type QueueHandlers = {
  selectedKey: string | null;
  hoveredKey: string | null;
  onSelect: (kind: 'order' | 'driver' | 'restaurant', id: string) => void;
  onHover: (key: string | null) => void;
};

/** The id a section header carries, so a summary tile can scroll to it. */
export function phaseSectionId(phase: OrderPhase): string {
  return `dispatch-phase-${phase}`;
}

export function driverSectionId(state: DriverState): string {
  return `dispatch-driver-${state}`;
}


export function OrderQueue({
  model,
  orders,
  now,
  query,
  handlers,
}: {
  model: DispatchModel;
  /** Already filtered by the panel's search box. */
  orders: DispatchOrder[];
  now: number;
  query: string;
  handlers: QueueHandlers;
}) {
  const { t } = useI18n();

  if (orders.length === 0) {
    return query ? (
      <EmptyNote>{t('dispatch.search.noOrders', { query })}</EmptyNote>
    ) : (
      <EmptyState title={t('dispatch.queue.emptyOrders')} body={t('dispatch.queue.emptyOrdersBody')} />
    );
  }

  // "Every accepted delivery has a driver" used to head this list. It is the tick on the
  // panel's "Need a driver" number now, which is visible from every tab and costs no row.
  return (
    <div className="flex flex-col">
      {ORDER_PHASES.map((phase) => {
        const rows = orders.filter((order) => order.phase === phase);
        if (rows.length === 0) return null;
        return (
          <section key={phase} id={phaseSectionId(phase)}>
            <SectionHeading color={PHASE_COLOR_VAR[phase]} label={t(PHASE_LABEL_KEY[phase])} count={rows.length} />
            <ul className="flex flex-col">
              {rows.map((order) => (
                <QueueOrderRow key={order.key} order={order} model={model} now={now} handlers={handlers} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function DriverQueue({
  model,
  drivers,
  now,
  query,
  handlers,
}: {
  model: DispatchModel;
  drivers: DispatchDriver[];
  now: number;
  query: string;
  handlers: QueueHandlers;
}) {
  const { t } = useI18n();

  if (drivers.length === 0) {
    return query ? (
      <EmptyNote>{t('dispatch.search.noDrivers', { query })}</EmptyNote>
    ) : (
      <EmptyState title={t('dispatch.queue.emptyDrivers')} body={t('dispatch.queue.emptyDriversBody')} />
    );
  }

  return (
    <div className="flex flex-col">
      {DRIVER_STATES.map((state) => {
        const rows = drivers.filter((driver) => driver.state === state);
        if (rows.length === 0) return null;
        return (
          <section key={state} id={driverSectionId(state)}>
            <SectionHeading
              color={DRIVER_COLOR_VAR[state]}
              label={t(DRIVER_STATE_LABEL_KEY[state])}
              count={rows.length}
            />
            <ul className="flex flex-col">
              {rows.map((driver) => (
                <QueueDriverRow key={driver.key} driver={driver} model={model} now={now} handlers={handlers} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

/**
 * The restaurants with an open order, most urgent first — the kitchens ops may have to
 * call. Only those: a restaurant with nothing on is not part of tonight's work, whether
 * it is open or not.
 */
export function RestaurantQueue({
  model,
  restaurants,
  now,
  query,
  handlers,
}: {
  model: DispatchModel;
  /** Already filtered by the panel's search box. */
  restaurants: DispatchRestaurant[];
  now: number;
  query: string;
  handlers: QueueHandlers;
}) {
  const { t } = useI18n();

  if (restaurants.length === 0) {
    return query ? (
      <EmptyNote>{t('dispatch.search.noRestaurants', { query })}</EmptyNote>
    ) : (
      <EmptyState title={t('dispatch.restaurants.empty')} body={t('dispatch.restaurants.emptyBody')} />
    );
  }

  return (
    <section>
      {/* One section, headed anyway: it says what the list is, and so why a restaurant
          someone is looking for might not be in it. */}
      <SectionHeading
        color="var(--foreground)"
        label={t('dispatch.restaurants.heading')}
        count={restaurants.length}
      />
      <ul className="flex flex-col">
        {restaurants.map((restaurant) => (
          <QueueRestaurantRow
            key={restaurant.key}
            restaurant={restaurant}
            model={model}
            now={now}
            handlers={handlers}
          />
        ))}
      </ul>
    </section>
  );
}

/* ---- rows -------------------------------------------------------------------- */

export function QueueOrderRow({
  order,
  model,
  now,
  handlers,
}: {
  order: DispatchOrder;
  model: DispatchModel;
  now: number;
  handlers: QueueHandlers;
}) {
  const { t, tCount, format } = useI18n();
  const { row } = order;

  const driver = order.driverId ? model.driversById.get(order.driverId) : undefined;
  const items = basketSize(readBasket(row));
  const trip = order.pickup && order.dropoff ? distanceMeters(order.pickup, order.dropoff) : null;
  const late = isLate(order, now);

  return (
    <QueueRow
      accent={PHASE_COLOR_VAR[order.phase]}
      isSelected={handlers.selectedKey === order.key}
      isHighlighted={handlers.hoveredKey === order.key}
      onSelect={() => handlers.onSelect('order', order.id)}
      onHover={(isHovered) => handlers.onHover(isHovered ? order.key : null)}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-caption text-muted tabular">
          {format.clock(row.createdAt)} · {format.elapsed(row.createdAt, now)}
        </span>
        <span className="text-caption tabular font-bold">#{shortId(order.id)}</span>
      </span>

      <span className="text-body flex min-w-0 items-center gap-1.5">
        <span className="truncate font-bold">{row.restaurant?.name ?? t('common.none')}</span>
        <ArrowRightIcon aria-hidden className="text-faint size-3 shrink-0" />
        <span className="text-muted truncate">{row.user?.fullname ?? t('common.none')}</span>
      </span>

      <span className="text-caption flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* First, and from the moment it is placed — not only once the restaurant accepts:
            an amber pickup waiting on the kitchen must not read as a delivery about to need
            a driver. */}
        {row.deliveryType !== 'delivery' && <PickupBadge />}
        {/* Ops' two calls, while they still matter. Marks only: the row is a button, and
            the calls are marked in the order's detail, one tap away. */}
        {canMarkCalls(row) && <CallChips order={row} readOnly />}
        {order.phase === 'needsDriver' && (
          <Tag tone="danger">{t('dispatch.queue.noDriver')}</Tag>
        )}
        {order.queue && <QueueSlotTag order={order} model={model} now={now} />}
        {/* The kitchen has bagged it while nobody is carrying it — the minutes in this
            window are the ones a customer feels. */}
        {row.isReady && order.phase !== 'withDriver' && <Tag tone="success">{t('orders.row.ready')}</Tag>}
        {late && (
          <Tag tone="warning">
            <ClockIcon aria-hidden className="size-3" />
            {t('dispatch.queue.waiting', { duration: format.elapsed(row.createdAt, now) })}
          </Tag>
        )}
        {driver && (
          <span className="text-muted truncate">
            {driver.row.fullname ?? t('common.none')} ·{' '}
            {t(row.status === 2 ? 'dispatch.queue.toCustomer' : 'dispatch.queue.toRestaurant')}
          </span>
        )}
        {trip !== null && <span className="text-faint tabular">{format.distance(trip)}</span>}
        {items > 0 && <span className="text-faint">{tCount('orders.row.items', items)}</span>}
      </span>
    </QueueRow>
  );
}

export function QueueDriverRow({
  driver,
  model,
  now,
  handlers,
}: {
  driver: DispatchDriver;
  model: DispatchModel;
  now: number;
  handlers: QueueHandlers;
}) {
  const { t, format } = useI18n();
  const job = driver.orderIds.length > 0 ? model.ordersById.get(driver.orderIds[0]) : undefined;
  // The first number only — a driver row with two numbers joined by a slash spends the
  // whole caption line on the one driver in fifty who registered a second phone. The
  // detail lists them all, dialable.
  const phone = splitPhones(driver.row.phone)[0];

  return (
    <QueueRow
      accent={DRIVER_COLOR_VAR[driver.state]}
      isSelected={handlers.selectedKey === driver.key}
      isHighlighted={handlers.hoveredKey === driver.key}
      onSelect={() => handlers.onSelect('driver', driver.id)}
      onHover={(isHovered) => handlers.onHover(isHovered ? driver.key : null)}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-body truncate font-bold">
          {driver.row.fullname ?? driver.row.username ?? t('common.none')}
        </span>
        <span className="text-caption text-muted shrink-0">
          {t(DRIVER_STATE_LABEL_KEY[driver.state])}
        </span>
      </span>

      <span className="text-caption text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
        {phone && (
          <span className="tabular inline-flex items-center gap-1">
            <PhoneIcon aria-hidden className="size-3.5" />
            {phone}
          </span>
        )}
        <span className={driver.isStale ? 'text-warning-soft-foreground font-bold' : 'text-faint'}>
          {driver.seenAt === null
            ? t('dispatch.queue.noPosition')
            : t('dispatch.queue.seen', {
                time: format.relative(new Date(driver.seenAt).toISOString(), now),
              })}
        </span>
      </span>

      {job && (
        <span className="text-caption text-muted flex min-w-0 items-center gap-1.5">
          <span className="tabular shrink-0 font-bold">
            {t('dispatch.queue.carrying', { order: shortId(job.id) })}
          </span>
          <span className="truncate">{job.row.restaurant?.name ?? t('common.none')}</span>
        </span>
      )}

      <DriverQueueLine driver={driver} />
    </QueueRow>
  );
}

/**
 * "Queued · Karim · no. 2", "Sent to Karim · 2 min ago" once it has gone and not been
 * accepted, or "Not accepted · Karim" once that offer has run out — plus "Retrying" while
 * the runner is waiting to try a refused send again.
 */
export function QueueSlotTag({ order, model, now }: { order: DispatchOrder; model: DispatchModel; now: number }) {
  const { t, format } = useI18n();
  const slot = order.queue;
  if (!slot) return null;
  const driver = driverNameOf(model, slot.driverId, slot.entry.driver?.fullname) ?? t('common.none');
  const sentAt = sentAtOf(slot.entry, now);
  const retryAt = slot.kind === 'waiting' ? retryAtOf(slot.entry) : null;

  return (
    <>
      <Tag tone={slot.kind === 'lapsed' ? 'danger' : 'queued'}>
        <QueueIcon aria-hidden className="size-3" />
        {slot.kind === 'waiting'
          ? t('dispatch.lineUp.queuedFor', { driver, position: slot.position })
          : slot.kind === 'offered'
            ? t('dispatch.lineUp.offeredAgo', {
                driver,
                ago: format.relative(sentAt === null ? null : new Date(sentAt).toISOString(), now),
              })
            : t('dispatch.lineUp.lapsedTo', { driver })}
      </Tag>
      {retryAt !== null && retryAt > now && (
        <Tag tone="warning">
          <RefreshIcon aria-hidden className="size-3" />
          {t('dispatch.lineUp.retryingTag')}
        </Tag>
      )}
    </>
  );
}

/** The orders lined up behind a driver, by number — "Next: #A1B2C3, #D4E5F6 +2". */
function DriverQueueLine({ driver }: { driver: DispatchDriver }) {
  const { t } = useI18n();
  const { orderIds, offeredOrderId } = driver.queue;
  if (orderIds.length === 0 && !offeredOrderId) return null;

  const upcoming = [...(offeredOrderId ? [offeredOrderId] : []), ...orderIds];
  const named = upcoming.slice(0, QUEUE_PREVIEW).map((orderId) => `#${shortId(orderId)}`).join(', ');
  const more = upcoming.length - QUEUE_PREVIEW;

  return (
    <span className="text-caption text-queued-soft-foreground flex min-w-0 items-center gap-1.5 font-bold">
      <QueueIcon aria-hidden className="size-3.5 shrink-0" />
      <span className="tabular truncate">
        {t('dispatch.lineUp.next', { orders: named })}
        {more > 0 ? ` ${t('dispatch.lineUp.more', { count: more })}` : ''}
      </span>
    </span>
  );
}

/**
 * A restaurant: how many open orders it has, whether it is still taking orders, the
 * number to call, and the two counts that are a reason to call it — orders nobody is
 * carrying yet, and orders it hasn't accepted.
 */
export function QueueRestaurantRow({
  restaurant,
  model,
  now,
  handlers,
}: {
  restaurant: DispatchRestaurant;
  model: DispatchModel;
  now: number;
  handlers: QueueHandlers;
}) {
  const { t, tCount, format } = useI18n();
  const phone = splitPhones(restaurant.row.phone)[0];

  const orders = restaurant.orderIds
    .map((orderId) => model.ordersById.get(orderId))
    .filter((order): order is DispatchOrder => order !== undefined);
  const noDriver = orders.filter((order) => order.phase === 'needsDriver').length;
  const toAccept = orders.filter((order) => order.phase === 'awaitingRestaurant');
  // `orderIds` runs oldest first within a phase, so the first late one is the oldest.
  const late = toAccept.find((order) => isLate(order, now));

  return (
    <QueueRow
      accent={PHASE_COLOR_VAR[restaurant.phase]}
      isSelected={handlers.selectedKey === restaurant.key}
      isHighlighted={handlers.hoveredKey === restaurant.key}
      onSelect={() => handlers.onSelect('restaurant', restaurant.id)}
      onHover={(isHovered) => handlers.onHover(isHovered ? restaurant.key : null)}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-body truncate font-bold">{restaurant.row.name ?? t('common.none')}</span>
        <span className="text-caption tabular shrink-0 font-bold">
          {tCount('dispatch.restaurants.orders', orders.length)}
        </span>
      </span>

      <span className="text-caption text-muted flex flex-wrap items-center gap-x-2 gap-y-1">
        <HoursText hours={restaurant.hours} />
        {phone && (
          <span className="tabular inline-flex items-center gap-1">
            <PhoneIcon aria-hidden className="size-3.5" />
            {phone}
          </span>
        )}
      </span>

      {(noDriver > 0 || toAccept.length > 0) && (
        <span className="text-caption flex flex-wrap items-center gap-x-2 gap-y-1">
          {noDriver > 0 && <Tag tone="danger">{tCount('dispatch.restaurants.noDriver', noDriver)}</Tag>}
          {toAccept.length > 0 && (
            <Tag tone="warning">{tCount('dispatch.restaurants.toAccept', toAccept.length)}</Tag>
          )}
          {late && (
            <Tag tone="warning">
              <ClockIcon aria-hidden className="size-3" />
              {t('dispatch.queue.waiting', { duration: format.elapsed(late.row.createdAt, now) })}
            </Tag>
          )}
        </span>
      )}
    </QueueRow>
  );
}

/* ---- shared shell ------------------------------------------------------------ */

function QueueRow({
  accent,
  isSelected,
  isHighlighted,
  onSelect,
  onHover,
  children,
}: {
  accent: string;
  isSelected: boolean;
  isHighlighted: boolean;
  onSelect: () => void;
  onHover: (isHovered: boolean) => void;
  children: ReactNode;
}) {
  return (
    <li className="border-separator/60 border-b last:border-b-0">
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={onSelect}
        onPointerEnter={() => onHover(true)}
        onPointerLeave={() => onHover(false)}
        onFocus={() => onHover(true)}
        onBlur={() => onHover(false)}
        className={
          'focus-visible:ring-focus flex w-full items-stretch gap-0 text-start transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset ' +
          (isSelected
            ? 'bg-accent-soft/50'
            : isHighlighted
              ? 'bg-surface-secondary/70'
              : 'hover:bg-surface-secondary/50')
        }
      >
        {/* The same rail the orders board uses, for the same reason: the shape of the
            queue should be readable without reading a word of it. */}
        <span aria-hidden className="w-1 shrink-0" style={{ backgroundColor: accent }} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2.5">{children}</span>
      </button>
    </li>
  );
}

function SectionHeading({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <h3 className="border-separator/70 bg-surface/95 text-micro text-muted sticky top-0 z-10 flex items-center gap-2 border-b px-3 py-1.5 font-bold tracking-[0.14em] uppercase backdrop-blur">
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="flex-1 truncate">{label}</span>
      <span className="tabular text-foreground">{count}</span>
    </h3>
  );
}

const TONE_CLASS = {
  danger: 'bg-danger-soft text-danger-soft-foreground',
  warning: 'bg-warning-soft text-warning-soft-foreground',
  success: 'bg-success-soft text-success-soft-foreground',
  queued: 'bg-queued-soft text-queued-soft-foreground',
  default: 'bg-surface-tertiary text-muted',
} as const;

export function Tag({ tone, children }: { tone: keyof typeof TONE_CLASS; children: ReactNode }) {
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold whitespace-nowrap ' +
        TONE_CLASS[tone]
      }
    >
      {children}
    </span>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-6 py-12 text-center">
      <span className="bg-surface-secondary text-muted mb-1 grid size-11 place-items-center rounded-2xl">
        <InboxIcon className="size-5" />
      </span>
      <p className="text-body font-bold">{title}</p>
      <p className="text-caption text-muted max-w-[22rem]">{body}</p>
    </div>
  );
}

function EmptyNote({ children }: { children: ReactNode }) {
  return <p className="text-caption text-muted px-3 py-8 text-center">{children}</p>;
}
