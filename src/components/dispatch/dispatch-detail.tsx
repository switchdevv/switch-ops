'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Button, Skeleton } from '@heroui/react';
import { useQueueRunnerStatus } from '@/components/queue-runner';
import { useOrderContents } from '@/hooks/use-dispatch';
import { useSecondClock } from '@/hooks/use-now';
import { initials, shortId, splitPhones } from '@/lib/format';
import { useI18n } from '@/lib/i18n/provider';
import { basketSize, readBasket } from '@/lib/ops/basket';
import { formatClockTime } from '@/lib/ops/restaurant-hours';
import {
  aheadOf,
  canQueueFor,
  canSendAgain,
  canTakeOrders,
  distanceMeters,
  DRIVER_COLOR_VAR,
  DRIVER_ON_COLOR_VAR,
  DRIVER_STATE_HINT_KEY,
  DRIVER_STATE_LABEL_KEY,
  isAssignable,
  lastStopOf,
  nextStopOf,
  PHASE_COLOR_VAR,
  PHASE_HINT_KEY,
  PHASE_LABEL_KEY,
  rankDrivers,
  rankOrders,
  rankQueueCandidates,
  type DispatchDriver,
  type DispatchModel,
  type DispatchOrder,
  type DispatchRestaurant,
  type DispatchSelection,
  type LatLng,
  type Ranked,
} from '@/lib/ops/dispatch';
import {
  DRIVER_OFFLINE,
  holdOf,
  isBeingSent,
  QUEUE_TICK_MS,
  sendStatusOf,
  type LineHold,
  type QueueSlot as QueueSlotModel,
} from '@/lib/ops/queue';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { ordersHref } from '@/lib/url/order-filters';
import type { QueueEntry } from '@/types/queue';
import { OrderActions } from '@/components/orders/order-actions';
import { OrderBasket, OrderPayment } from '@/components/orders/order-contents';
import { CopyValue } from '@/components/ui/copy-value';
import { PickupBadge } from '@/components/ui/pickup-badge';
import { StageChip } from '@/components/ui/stage-chip';
import {
  ArrowRightIcon,
  BagIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  CloseIcon,
  ExternalLinkIcon,
  HomeIcon,
  NoteIcon,
  PhoneIcon,
  QueueIcon,
  RefreshIcon,
  SignalOffIcon,
  StoreIcon,
  UserIcon,
} from '@/components/icons';
import { driverNameOf, QueueOrderRow, Tag, type QueueHandlers } from './dispatch-queue';
import { HoursText } from './restaurant-hours-text';
import type { DispatchRequest } from '@/hooks/use-dispatch';

/**
 * What one pin is, and what to do about it.
 *
 * The panel drills down rather than opening a card over the map: a bubble anchored to a
 * pin covers exactly the streets a dispatcher is comparing, and there is no room in one
 * for the thing this screen exists for — a ranked list of drivers with an Assign next to
 * each. The map keeps the selection visible instead, by dimming everything else and
 * drawing the lines between what is left.
 */

/** How many candidates are listed before "show all". Five is about what fits without
 * scrolling past the assign buttons, and past the fifth the distances stop being
 * meaningfully different from "somewhere else in the city". */
const CANDIDATE_PREVIEW = 5;

/**
 * Edits to a driver's queue. Unlike Assign and Queue these apply at once, without the
 * confirmation strip: moving an order up or taking it out rings nobody's phone, and each
 * is undone as easily as it was done.
 */
export type QueueActions = {
  onRemove: (entry: QueueEntry) => void;
  onMoveUp: (entry: QueueEntry, ahead: QueueEntry) => void;
  /** Sends a refused order on the runner's next look instead of after its retry delay. */
  onRetry: (entry: QueueEntry) => void;
  /** An edit is in flight; the buttons wait for it. */
  isChanging: boolean;
};

export type DetailProps = {
  model: DispatchModel;
  selection: DispatchSelection;
  now: number;
  handlers: QueueHandlers;
  onBack: () => void;
  /** Opens the confirmation strip at the foot of the panel. */
  onRequest: (request: DispatchRequest) => void;
  /** The request awaiting confirmation, so its row can show as armed. */
  pending: DispatchRequest | null;
  queueActions: QueueActions;
};

function isArmed(
  pending: DispatchRequest | null,
  kind: DispatchRequest['kind'],
  orderId: string,
  driverId: string,
): boolean {
  return pending?.kind === kind && pending.orderId === orderId && pending.driverId === driverId;
}

export function DispatchDetail(props: DetailProps) {
  const { model, selection } = props;

  if (selection.kind === 'order') {
    const order = model.ordersById.get(selection.id);
    return order ? <OrderDetail {...props} order={order} /> : <NotFound onBack={props.onBack} />;
  }
  if (selection.kind === 'driver') {
    const driver = model.driversById.get(selection.id);
    return driver ? <DriverDetail {...props} driver={driver} /> : <NotFound onBack={props.onBack} />;
  }
  const restaurant = model.restaurantsById.get(selection.id);
  return restaurant ? (
    <RestaurantDetail {...props} restaurant={restaurant} />
  ) : (
    <NotFound onBack={props.onBack} />
  );
}

/* ---- order ------------------------------------------------------------------- */

function OrderDetail({
  order,
  model,
  now,
  handlers,
  onBack,
  onRequest,
  pending,
  queueActions,
}: DetailProps & { order: DispatchOrder }) {
  const { t, tCount, format } = useI18n();
  const { row } = order;
  const currency = row.city?.currency;

  const driver = order.driverId ? model.driversById.get(order.driverId) : undefined;
  const items = basketSize(readBasket(row));
  const contents = useOrderContents(order.id);
  const trip = order.pickup && order.dropoff ? distanceMeters(order.pickup, order.dropoff) : null;
  const canAssign = isAssignable(order);
  const isPickup = row.deliveryType !== 'delivery';

  const candidates = useMemo(
    () => (canAssign ? rankDrivers(order.pickup, model.drivers) : []),
    [canAssign, order.pickup, model.drivers],
  );

  // Everyone on a job, as the other way to get this order out: behind them, in turn.
  // Not the driver it is already lined up behind.
  const queuedFor = order.queue?.driverId;
  const busyCandidates = useMemo(
    () =>
      canAssign
        ? rankQueueCandidates(order.pickup, model).filter(({ item }) => item.id !== queuedFor)
        : [],
    [canAssign, order.pickup, model, queuedFor],
  );

  return (
    <DetailShell onBack={onBack}>
      <header className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-h5 tabular font-bold">#{shortId(order.id)}</h2>
            <CopyValue
              value={order.id}
              label={t('orders.detail.copyId')}
              className="text-caption text-muted"
            />
          </div>
          <StageChip order={row} />
        </div>

        {isPickup && <PickupBadge size="md" />}

        <PhaseBadge
          order={order}
          hint={order.phase === 'queued' ? <QueueWaitHint order={order} model={model} /> : undefined}
        />

        <p className="text-caption text-muted">
          {t('dispatch.detail.placed', { time: format.dateTime(row.createdAt) })} ·{' '}
          {format.elapsed(row.createdAt, now)} ·{' '}
          {t(isPickup ? 'orders.type.pickup' : 'orders.type.delivery')}
          {items > 0 ? ` · ${tCount('orders.row.items', items)}` : ''} ·{' '}
          <span className="text-foreground font-bold">
            {format.money(row.options?.total, currency)}
          </span>
        </p>
      </header>

      {/* Keyed by order: moving from one order to the next reuses this panel, and a
          Confirm left armed must not carry over to an order nobody asked about. */}
      <OrderActions key={order.id} order={row} />

      {row.options?.note && (
        <div className="bg-warning-soft text-warning-soft-foreground flex items-start gap-2 rounded-xl p-2.5">
          <NoteIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p className="text-caption">
            <span className="font-bold">{t('orders.detail.orderNote')}: </span>
            {row.options.note}
          </p>
        </div>
      )}

      <Panel title={t('dispatch.detail.route')}>
        <Stop
          icon={<StoreIcon className="size-4" />}
          eyebrow={t('dispatch.detail.pickupStop')}
          name={row.restaurant?.name}
          detail={row.restaurant?.address}
          phone={row.restaurant?.phone}
          hasPin={order.pickup !== null}
          onOpen={
            order.restaurantId ? () => handlers.onSelect('restaurant', order.restaurantId!) : undefined
          }
        />

        <div className="text-caption text-faint tabular flex items-center gap-2 ps-[13px]">
          <span aria-hidden className="border-border h-6 border-s border-dashed" />
          {trip !== null && <span>{t('dispatch.detail.straightLine', { distance: format.distance(trip) })}</span>}
        </div>

        {isPickup ? (
          <>
            <p className="text-caption bg-surface-secondary flex items-start gap-2 rounded-lg px-2.5 py-2">
              <BagIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {t('dispatch.detail.collectedByCustomer')}
            </p>
            <Stop
              icon={<UserIcon className="size-4" />}
              eyebrow={t('orders.detail.customer')}
              name={row.user?.fullname}
              detail={undefined}
              phone={row.user?.phone}
              // Nothing to pin: the customer comes to the restaurant.
              hasPin
            />
          </>
        ) : (
          <Stop
            icon={<HomeIcon className="size-4" />}
            eyebrow={t('dispatch.detail.dropoffStop')}
            name={row.user?.fullname}
            detail={[row.userAddress?.name, row.userAddress?.address].filter(Boolean).join(' — ')}
            phone={row.user?.phone}
            hasPin={order.dropoff !== null}
          />
        )}
      </Panel>

      {/* No Driver panel on a pickup at all: an empty slot there reads as one waiting to
          be filled, and nobody is ever sent to one. The board's detail leaves it out too. */}
      {!isPickup && (
        <Panel title={t('dispatch.detail.driver')}>
          {driver ? (
            <DriverLine
              driver={driver}
              now={now}
              distanceTo={nextStopOf(order)}
              onOpen={() => handlers.onSelect('driver', driver.id)}
              onHover={handlers.onHover}
            />
          ) : order.queue ? (
            <QueueSlot
              order={order}
              model={model}
              now={now}
              handlers={handlers}
              queueActions={queueActions}
              pending={pending}
              onRequest={onRequest}
            />
          ) : (
            <p className="text-caption text-danger-soft-foreground bg-danger-soft rounded-lg px-2.5 py-2 font-bold">
              {t('dispatch.detail.noDriverYet')}
            </p>
          )}
        </Panel>
      )}

      {canAssign && (
        <CandidateDrivers
          candidates={candidates}
          model={model}
          now={now}
          handlers={handlers}
          orderId={order.id}
          pending={pending}
          onRequest={onRequest}
          notice={order.phase === 'awaitingRestaurant' ? t('dispatch.detail.notAcceptedYet') : undefined}
        />
      )}

      {canAssign && (
        <QueueCandidates
          candidates={busyCandidates}
          handlers={handlers}
          orderId={order.id}
          pending={pending}
          onRequest={onRequest}
        />
      )}

      {/* Below the dispatch half rather than above it: picking a driver is what this
          panel is for, and a fifteen-line basket above the Assign buttons would push them
          off the screen. The total and item count are already in the header. */}
      <Panel title={t('orders.detail.basket')}>
        {/* Read for this order alone (the map's list leaves dishes out). Until it lands, a
            skeleton rather than lines with no names; if it can't be read, the lines the
            row has, quantities and prices included. */}
        {contents.isPending ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full rounded-xl" />
            <Skeleton className="h-9 w-full rounded-xl" />
          </div>
        ) : (
          <OrderBasket order={contents.data ?? row} currency={currency} />
        )}
      </Panel>

      <Panel title={t('orders.detail.payment')}>
        <OrderPayment order={contents.data ?? row} currency={currency} />
      </Panel>

      <BoardLink href={ordersHref('objectId', order.id)} label={t('dispatch.detail.openInOrders')} />
    </DetailShell>
  );
}

/* ---- driver ------------------------------------------------------------------ */

function DriverDetail({
  driver,
  model,
  now,
  handlers,
  onBack,
  onRequest,
  pending,
  queueActions,
}: DetailProps & { driver: DispatchDriver }) {
  const { t, format } = useI18n();
  const name = driver.row.fullname ?? driver.row.username ?? t('common.none');

  // A free driver is sent an order now; one on a job has it lined up behind what they
  // carry. Either way the list is the orders nobody has a driver for, nearest first — to
  // where the driver is now, or to where they will finish.
  const action: DispatchRequest['kind'] | null = canTakeOrders(driver)
    ? 'assign'
    : canQueueFor(driver)
      ? 'queue'
      : null;
  const from = action === 'assign' ? driver.location : action === 'queue' ? lastStopOf(model, driver) : null;

  const waiting = useMemo(
    () => (action ? rankOrders(from, model.orders) : []),
    [action, from, model.orders],
  );

  return (
    <DetailShell onBack={onBack}>
      <header className="flex items-start gap-3">
        <Avatar name={name} color={DRIVER_COLOR_VAR[driver.state]} onColor={DRIVER_ON_COLOR_VAR[driver.state]} />
        <div className="min-w-0 flex-1">
          <h2 className="text-h6 truncate font-bold">{name}</h2>
          <span className="text-caption text-muted flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ backgroundColor: DRIVER_COLOR_VAR[driver.state] }}
            />
            {t(DRIVER_STATE_LABEL_KEY[driver.state])}
          </span>
          <CopyValue value={driver.id} label={t('orders.detail.copyId')} className="text-caption text-faint" />
        </div>
      </header>

      <p className="text-caption text-muted">{t(DRIVER_STATE_HINT_KEY[driver.state])}</p>

      <div className="flex flex-col gap-1.5">
        <PhoneLinks phone={driver.row.phone} />
        <p className="text-caption text-muted">
          {driver.seenAt === null
            ? t('dispatch.detail.noPosition')
            : t('dispatch.detail.position', {
                time: format.relative(new Date(driver.seenAt).toISOString(), now),
              })}
        </p>
      </div>

      {driver.isStale && driver.seenAt !== null && (
        <p className="text-caption bg-warning-soft text-warning-soft-foreground flex items-start gap-2 rounded-xl p-2.5">
          <SignalOffIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t('dispatch.detail.staleWarning', {
            duration: format.elapsed(new Date(driver.seenAt).toISOString(), now),
          })}
        </p>
      )}

      {driver.orderIds.length > 0 && (
        <Panel title={t('dispatch.detail.carrying')} isFlush>
          <ul className="flex flex-col">
            {driver.orderIds.map((orderId) => {
              const order = model.ordersById.get(orderId);
              return order ? (
                <QueueOrderRow key={orderId} order={order} model={model} now={now} handlers={handlers} />
              ) : null;
            })}
          </ul>
        </Panel>
      )}

      <UpNext
        driver={driver}
        model={model}
        now={now}
        handlers={handlers}
        queueActions={queueActions}
        pending={pending}
        onRequest={onRequest}
      />

      {action ? (
        <section className="flex flex-col gap-2">
          <SectionTitle
            title={t(action === 'assign' ? 'dispatch.detail.nearbyOrders' : 'dispatch.lineUp.driverOrders')}
            hint={t(action === 'assign' ? 'dispatch.detail.nearbyOrdersHint' : 'dispatch.lineUp.driverOrdersHint')}
          />
          {waiting.length === 0 ? (
            <p className="text-caption text-success-soft-foreground bg-success-soft/60 rounded-lg px-2.5 py-2">
              {t('dispatch.detail.noNearbyOrders')}
            </p>
          ) : (
            // Every waiting order, not the first five: which one this driver takes is the
            // dispatcher's call, and the one they want is often not among the nearest.
            <ul className="flex flex-col gap-1.5">
              {waiting.map(({ item, meters }, index) => (
                <li key={item.key} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlers.onSelect('order', item.id)}
                    onPointerEnter={() => handlers.onHover(item.key)}
                    onPointerLeave={() => handlers.onHover(null)}
                    className="hover:bg-surface-secondary focus-visible:ring-focus flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-start transition-colors outline-none focus-visible:ring-2"
                  >
                    <Rank value={index + 1} />
                    <span className="flex min-w-0 flex-col leading-tight">
                      {/* Restaurant to customer, as the order list reads: two orders from
                          the same restaurant are told apart by who they are for. */}
                      <span className="text-body flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-bold">
                          {item.row.restaurant?.name ?? t('common.none')}
                        </span>
                        <ArrowRightIcon aria-hidden className="text-faint size-3 shrink-0" />
                        <span className="text-muted truncate">
                          {item.row.user?.fullname ?? t('common.none')}
                        </span>
                      </span>
                      <span className="text-caption text-muted tabular flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                        <span>
                          #{shortId(item.id)} ·{' '}
                          {meters === null ? t('dispatch.queue.noPosition') : format.distance(meters)} ·{' '}
                          {format.elapsed(item.row.createdAt, now)}
                        </span>
                        {item.phase === 'awaitingRestaurant' && (
                          <Tag tone="warning">{t('dispatch.kpi.awaitingRestaurant')}</Tag>
                        )}
                      </span>
                    </span>
                  </button>
                  <ActionButton
                    label={t(action === 'assign' ? 'dispatch.detail.assign' : 'dispatch.lineUp.queue')}
                    isArmed={isArmed(pending, action, item.id, driver.id)}
                    onPress={() => onRequest({ kind: action, orderId: item.id, driverId: driver.id })}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <p className="text-caption text-muted bg-surface-secondary/70 rounded-lg px-2.5 py-2">
          {t('dispatch.detail.offlineNotice')}
        </p>
      )}

      <BoardLink href={ordersHref('driver', driver.id)} label={t('dispatch.detail.driverHistory')} />
    </DetailShell>
  );
}

/* ---- restaurant --------------------------------------------------------------- */

function RestaurantDetail({
  restaurant,
  model,
  now,
  handlers,
  onBack,
}: DetailProps & { restaurant: DispatchRestaurant }) {
  const { t, format } = useI18n();
  const name = restaurant.row.name ?? t('common.none');

  const orders = restaurant.orderIds
    .map((orderId) => model.ordersById.get(orderId))
    .filter((order): order is DispatchOrder => order !== undefined);

  const needsDriver = orders.some(isAssignable);

  // The "does anything here need a driver" test is repeated inside the memo rather than
  // passed into it: `orders` is rebuilt on every render, and a dependency the compiler
  // can't prove stable turns this into a memo it refuses to keep.
  const nearby = useMemo(() => {
    const wanted = restaurant.orderIds.some((orderId) => {
      const order = model.ordersById.get(orderId);
      return order ? isAssignable(order) : false;
    });
    return wanted ? rankDrivers(restaurant.location, model.drivers).slice(0, CANDIDATE_PREVIEW) : [];
  }, [restaurant.orderIds, restaurant.location, model]);

  return (
    <DetailShell onBack={onBack}>
      <header className="flex items-start gap-3">
        <Avatar
          name={name}
          color={PHASE_COLOR_VAR[restaurant.phase]}
          onColor="var(--surface)"
          icon={<StoreIcon className="size-5" />}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-h6 truncate font-bold">{name}</h2>
          {restaurant.row.address && (
            <p className="text-caption text-muted">{restaurant.row.address}</p>
          )}
          <CopyValue value={restaurant.id} label={t('orders.detail.copyId')} className="text-caption text-faint" />
        </div>
      </header>

      <PhoneLinks phone={restaurant.row.phone} />
      {!restaurant.location && (
        <p className="text-micro text-warning-soft-foreground">{t('dispatch.detail.noPin')}</p>
      )}

      <RestaurantHoursPanel restaurant={restaurant} />

      <Panel title={t('dispatch.detail.ordersHere')} isFlush>
        <ul className="flex flex-col">
          {orders.map((order) => (
            <QueueOrderRow key={order.key} order={order} model={model} now={now} handlers={handlers} />
          ))}
        </ul>
      </Panel>

      {needsDriver && (
        <section className="flex flex-col gap-2">
          <SectionTitle title={t('dispatch.detail.candidates')} hint={t('dispatch.detail.candidatesHint')} />
          {nearby.length === 0 ? (
            <p className="text-caption text-muted">{t('dispatch.detail.noCandidates')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {nearby.map(({ item, meters }, index) => (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => handlers.onSelect('driver', item.id)}
                    onPointerEnter={() => handlers.onHover(item.key)}
                    onPointerLeave={() => handlers.onHover(null)}
                    className="hover:bg-surface-secondary focus-visible:ring-focus flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-start transition-colors outline-none focus-visible:ring-2"
                  >
                    <Rank value={index + 1} />
                    <span className="flex min-w-0 flex-1 flex-col leading-tight">
                      <span className="text-body truncate font-bold">
                        {item.row.fullname ?? t('common.none')}
                      </span>
                      <span className="text-caption text-muted tabular">
                        {meters === null ? t('dispatch.queue.noPosition') : format.distance(meters)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <BoardLink href={ordersHref('restaurant', restaurant.id)} label={t('dispatch.detail.restaurantHistory')} />
    </DetailShell>
  );
}

/**
 * Whether it is taking orders, and the week behind that answer — the question a customer
 * on the phone asks ("when do they open?") and the one ops asks of a kitchen that has
 * gone quiet.
 */
function RestaurantHoursPanel({ restaurant }: { restaurant: DispatchRestaurant }) {
  const { t, format } = useI18n();
  const { openTime, closeTime, pauseStart, pauseEnd, workingDays } = restaurant.row;
  const days = workingDays
    ? [...new Set(workingDays)].filter((day) => day >= 0 && day <= 6).sort((a, b) => a - b)
    : null;

  return (
    <Panel title={t('dispatch.hours.title')}>
      <HoursText hours={restaurant.hours} className="text-body" />
      {restaurant.hours.state === 'paused' && (
        <p className="text-caption text-muted">{t('dispatch.hours.pausedHint')}</p>
      )}
      {openTime && closeTime && (
        <p className="text-caption text-muted tabular">
          {t('dispatch.hours.schedule', { open: formatClockTime(openTime), close: formatClockTime(closeTime) })}
          {pauseStart && pauseEnd
            ? ` · ${t('dispatch.hours.breakWindow', {
                start: formatClockTime(pauseStart),
                end: formatClockTime(pauseEnd),
              })}`
            : ''}
        </p>
      )}
      <p className="text-caption text-muted">
        {!days || days.length === 7
          ? t('dispatch.hours.everyDay')
          : days.map((day) => format.weekday(day)).join(' · ')}
      </p>
    </Panel>
  );
}

/* ---- shared ------------------------------------------------------------------- */

function DetailShell({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-3.5 p-3">
      <button
        type="button"
        onClick={onBack}
        className="text-caption text-muted hover:text-foreground focus-visible:ring-focus -ms-1 flex w-fit items-center gap-1 rounded-lg px-1 py-0.5 font-bold transition-colors outline-none focus-visible:ring-2"
      >
        <ChevronLeftIcon aria-hidden className="size-4" />
        {t('dispatch.detail.back')}
      </button>
      {children}
    </div>
  );
}

function NotFound({ onBack }: { onBack: () => void }) {
  const { t } = useI18n();
  return (
    <DetailShell onBack={onBack}>
      <div className="flex flex-col gap-1.5 py-6 text-center">
        <p className="text-body font-bold">{t('dispatch.detail.notFoundTitle')}</p>
        <p className="text-caption text-muted">{t('dispatch.detail.notFoundBody')}</p>
      </div>
    </DetailShell>
  );
}

function Panel({
  title,
  children,
  isFlush,
}: {
  title: string;
  children: ReactNode;
  /** Rows that carry their own padding — a list of queue rows, not a stack of text. */
  isFlush?: boolean;
}) {
  return (
    <section className="border-border/70 bg-surface-secondary/40 overflow-hidden rounded-xl border">
      <h3 className="text-micro text-muted border-separator/70 border-b px-3 py-1.5 font-bold tracking-[0.14em] uppercase">
        {title}
      </h3>
      <div className={isFlush ? '' : 'flex flex-col gap-2 p-3'}>{children}</div>
    </section>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col">
      <h3 className="text-micro text-muted font-bold tracking-[0.14em] uppercase">{title}</h3>
      {hint && <p className="text-micro text-faint">{hint}</p>}
    </div>
  );
}

/** `hint` replaces the phase's fixed one-liner, for a phase whose answer depends on more
 * than the phase. */
function PhaseBadge({ order, hint }: { order: DispatchOrder; hint?: ReactNode }) {
  const { t } = useI18n();
  // The kitchen has bagged it. Same tag the queue row carries, kept here until the food
  // has actually left the restaurant (status 2), after which "ready" says nothing.
  const isReady = order.row.isReady === true && (order.row.status ?? 0) < 2;

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-caption flex flex-wrap items-center gap-1.5">
        <span
          className="w-fit rounded-lg px-2 py-1 font-bold"
          style={{
            backgroundColor: `color-mix(in oklch, ${PHASE_COLOR_VAR[order.phase]} 16%, transparent)`,
            color: PHASE_COLOR_VAR[order.phase],
          }}
        >
          {t(PHASE_LABEL_KEY[order.phase])}
        </span>
        {isReady && <Tag tone="success">{t('orders.row.ready')}</Tag>}
      </span>
      {hint ?? <span className="text-micro text-faint">{t(PHASE_HINT_KEY[order.phase])}</span>}
    </div>
  );
}

/**
 * What a queued order is waiting on, in the line under its phase — the first thing a
 * dispatcher reads about it.
 *
 * The phase alone can't say. A fixed "behind a driver on another job" was shown for every
 * queued order, including one whose driver was free with their app switched off: the one
 * case where the order won't go out until someone calls the driver. So that case, and a
 * refused send, are in warning colour.
 */
function QueueWaitHint({ order, model }: { order: DispatchOrder; model: DispatchModel }) {
  const { t } = useI18n();
  const now = useSecondClock();
  const slot = order.queue;
  const driver = slot ? model.driversById.get(slot.driverId) : undefined;
  const fallback = <span className="text-micro text-faint">{t(PHASE_HINT_KEY[order.phase])}</span>;
  // Nothing to judge the hold on without the driver's row; the fixed hint is still true.
  if (!slot || !driver) return fallback;

  const status = sendStatusOf(slot, lineHoldOf(driver, now), now);
  let key: MessageKey;
  let isWarning = false;
  switch (status.kind) {
    case 'behind':
      key = 'dispatch.lineUp.waitBehind';
      break;
    case 'held':
      key =
        status.hold === 'busy'
          ? 'dispatch.lineUp.waitBusy'
          : status.hold === 'offer'
            ? 'dispatch.lineUp.waitOffer'
            : 'dispatch.lineUp.waitOffline';
      isWarning = status.hold === 'offline';
      break;
    case 'ready':
    case 'sending':
      key = 'dispatch.lineUp.waitSending';
      break;
    case 'retrying':
      key = 'dispatch.lineUp.waitRetrying';
      isWarning = true;
      break;
    case 'offered':
      key = 'dispatch.lineUp.waitOffered';
      break;
    case 'lapsed':
      // Not a queued phase: a lapsed offer puts the order back to needing a driver.
      return fallback;
  }

  const name = driverNameOf(model, slot.driverId, slot.entry.driver?.fullname) ?? t('common.none');
  return (
    <span className={'text-micro ' + (isWarning ? 'text-warning-soft-foreground font-bold' : 'text-faint')}>
      {t(key, { driver: name })}
    </span>
  );
}

/** Why the first order in `driver`'s line can't go yet, judged on the caller's clock
 * rather than the one the model was built with. */
function lineHoldOf(driver: DispatchDriver, now: number): LineHold | null {
  return holdOf(
    { driverId: driver.id, driver: driver.row, entries: driver.queue.entries, offer: driver.queue.offer },
    { isBusy: driver.orderIds.length > 0, isOnline: driver.row.driverActive === true },
    now,
  );
}

function Stop({
  icon,
  eyebrow,
  name,
  detail,
  phone,
  hasPin,
  onOpen,
}: {
  icon: ReactNode;
  eyebrow: string;
  name: string | undefined;
  detail: string | undefined;
  phone: string | undefined;
  hasPin: boolean;
  onOpen?: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="flex items-start gap-2.5">
      <span className="bg-surface text-muted border-border/70 mt-0.5 grid size-[26px] shrink-0 place-items-center rounded-lg border">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-micro text-faint font-bold tracking-[0.1em] uppercase">{eyebrow}</span>
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="text-body hover:text-link focus-visible:ring-focus block max-w-full truncate rounded font-bold transition-colors outline-none focus-visible:ring-2"
          >
            {name ?? t('common.none')}
          </button>
        ) : (
          <p className="text-body truncate font-bold">{name ?? t('common.none')}</p>
        )}
        {detail && <p className="text-caption text-muted">{detail}</p>}
        <PhoneLinks phone={phone} />
        {!hasPin && <p className="text-micro text-warning-soft-foreground">{t('dispatch.detail.noPin')}</p>}
      </div>
    </div>
  );
}

function DriverLine({
  driver,
  now,
  distanceTo,
  onOpen,
  onHover,
}: {
  driver: DispatchDriver;
  now: number;
  /** Where they are heading, so the panel can say how far off they are. */
  distanceTo: LatLng | null;
  onOpen: () => void;
  onHover: (key: string | null) => void;
}) {
  const { t, format } = useI18n();
  const name = driver.row.fullname ?? t('common.none');
  const away = driver.location && distanceTo ? distanceMeters(driver.location, distanceTo) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={onOpen}
        onPointerEnter={() => onHover(driver.key)}
        onPointerLeave={() => onHover(null)}
        className="hover:bg-surface-secondary focus-visible:ring-focus -mx-1 flex items-center gap-2.5 rounded-lg px-1 py-1 text-start transition-colors outline-none focus-visible:ring-2"
      >
        <Avatar name={name} color={DRIVER_COLOR_VAR[driver.state]} onColor={DRIVER_ON_COLOR_VAR[driver.state]} isSmall />
        <span className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-body truncate font-bold">{name}</span>
          <span className="text-caption text-muted tabular">
            {driver.seenAt === null
              ? t('dispatch.detail.noPosition')
              : t('dispatch.detail.position', {
                  time: format.relative(new Date(driver.seenAt).toISOString(), now),
                })}
            {away !== null ? ` · ${format.distance(away)}` : ''}
          </span>
        </span>
      </button>
      <PhoneLinks phone={driver.row.phone} />
      {driver.isStale && <Tag tone="warning">{t('dispatch.driverState.signalLost')}</Tag>}
    </div>
  );
}

function CandidateDrivers({
  candidates,
  model,
  now,
  handlers,
  orderId,
  pending,
  onRequest,
  notice,
}: {
  candidates: Ranked<DispatchDriver>[];
  model: DispatchModel;
  now: number;
  handlers: QueueHandlers;
  orderId: string;
  pending: DispatchRequest | null;
  onRequest: (request: DispatchRequest) => void;
  /** Shown above the list — the caveat that this order isn't accepted yet. */
  notice?: string;
}) {
  const { t, tCount, format } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? candidates : candidates.slice(0, CANDIDATE_PREVIEW);

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title={t('dispatch.detail.candidates')} hint={t('dispatch.detail.candidatesHint')} />

      {notice && (
        <p className="text-caption bg-warning-soft text-warning-soft-foreground rounded-lg px-2.5 py-2">
          {notice}
        </p>
      )}

      {candidates.length === 0 ? (
        <div className="text-caption text-muted flex flex-col gap-1">
          <p>{t('dispatch.detail.noCandidates')}</p>
          {model.counts.busy > 0 && (
            <p className="text-faint">{tCount('dispatch.detail.othersBusy', model.counts.busy)}</p>
          )}
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {shown.map(({ item, meters }, index) => (
              <li key={item.key} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlers.onSelect('driver', item.id)}
                  onPointerEnter={() => handlers.onHover(item.key)}
                  onPointerLeave={() => handlers.onHover(null)}
                  className="hover:bg-surface-secondary focus-visible:ring-focus flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-start transition-colors outline-none focus-visible:ring-2"
                >
                  <Rank value={index + 1} />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="text-body truncate font-bold">
                      {item.row.fullname ?? item.row.username ?? t('common.none')}
                    </span>
                    <span className="text-caption text-muted tabular truncate">
                      {meters === null ? t('dispatch.queue.noPosition') : format.distance(meters)}
                      {item.seenAt !== null
                        ? ` · ${t('dispatch.queue.seen', {
                            time: format.relative(new Date(item.seenAt).toISOString(), now),
                          })}`
                        : ''}
                    </span>
                  </span>
                  {item.isStale && <SignalOffIcon aria-hidden className="text-warning-soft-foreground size-4 shrink-0" />}
                </button>
                <ActionButton
                  label={t('dispatch.detail.assign')}
                  isArmed={isArmed(pending, 'assign', orderId, item.id)}
                  onPress={() => onRequest({ kind: 'assign', orderId, driverId: item.id })}
                />
              </li>
            ))}
          </ul>

          {candidates.length > CANDIDATE_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="text-caption text-link hover:underline focus-visible:ring-focus w-fit rounded font-bold outline-none focus-visible:ring-2"
            >
              {showAll
                ? t('dispatch.detail.showFewer')
                : t('dispatch.detail.showAll', { count: candidates.length })}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Drivers on a job this order could be lined up behind, by how near they will finish.
 * The second way to get an order out when no free driver is close: it goes the moment
 * one of these delivers what they carry.
 */
function QueueCandidates({
  candidates,
  handlers,
  orderId,
  pending,
  onRequest,
}: {
  candidates: Ranked<DispatchDriver>[];
  handlers: QueueHandlers;
  orderId: string;
  pending: DispatchRequest | null;
  onRequest: (request: DispatchRequest) => void;
}) {
  const { t, tCount, format } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? candidates : candidates.slice(0, CANDIDATE_PREVIEW);

  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title={t('dispatch.lineUp.candidates')} hint={t('dispatch.lineUp.candidatesHint')} />

      {candidates.length === 0 ? (
        <p className="text-caption text-muted">{t('dispatch.lineUp.noCandidates')}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {shown.map(({ item, meters }, index) => (
              <li key={item.key} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlers.onSelect('driver', item.id)}
                  onPointerEnter={() => handlers.onHover(item.key)}
                  onPointerLeave={() => handlers.onHover(null)}
                  className="hover:bg-surface-secondary focus-visible:ring-focus flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-start transition-colors outline-none focus-visible:ring-2"
                >
                  <Rank value={index + 1} />
                  <span className="flex min-w-0 flex-col leading-tight">
                    <span className="text-body truncate font-bold">
                      {item.row.fullname ?? item.row.username ?? t('common.none')}
                    </span>
                    <span className="text-caption text-muted tabular truncate">
                      {tCount('dispatch.lineUp.ahead', aheadOf(item))} ·{' '}
                      {meters === null ? t('dispatch.queue.noPosition') : format.distance(meters)}
                    </span>
                  </span>
                </button>
                <ActionButton
                  label={t('dispatch.lineUp.queue')}
                  isArmed={isArmed(pending, 'queue', orderId, item.id)}
                  onPress={() => onRequest({ kind: 'queue', orderId, driverId: item.id })}
                />
              </li>
            ))}
          </ul>

          {candidates.length > CANDIDATE_PREVIEW && (
            <button
              type="button"
              onClick={() => setShowAll((value) => !value)}
              className="text-caption text-link hover:underline focus-visible:ring-focus w-fit rounded font-bold outline-none focus-visible:ring-2"
            >
              {showAll
                ? t('dispatch.detail.showFewer')
                : t('dispatch.detail.showAll', { count: candidates.length })}
            </button>
          )}
        </>
      )}
    </section>
  );
}

/**
 * Where a queued order's send stands, in words — waiting, about to go, going, refused and
 * retrying, sent, or sent and never taken — with what a dispatcher can do about it.
 *
 * Keeps its own one-second clock rather than the panel's fifteen: "going out in 3 s" and
 * "trying again in 8 s" are only worth saying if they count down. The line's hold is
 * worked out again on that clock for the same reason — the model's was decided up to
 * fifteen seconds ago, and a retry that has come due would still read as waiting.
 */
function SendStatusLine({
  slot,
  driver,
  queueActions,
  sendAgain,
}: {
  slot: QueueSlotModel;
  /** The slot's driver, when the map has them. */
  driver: DispatchDriver | undefined;
  queueActions: QueueActions;
  /** Offered when the driver could be sent it again right now. */
  sendAgain?: { isArmed: boolean; onPress: () => void };
}) {
  const { t, tCount, format } = useI18n();
  const now = useSecondClock();
  const runner = useQueueRunnerStatus();

  const hold = driver ? lineHoldOf(driver, now) : null;
  const status = sendStatusOf(slot, hold, now);

  const reasonOf = (error: string) =>
    error === DRIVER_OFFLINE
      ? t('dispatch.lineUp.refusedOffline')
      : t('dispatch.lineUp.refusedOther', { code: error });
  const isoOf = (time: number | null) => (time === null ? null : new Date(time).toISOString());
  const attempts = 'attempts' in status && status.attempts > 1 ? tCount('dispatch.lineUp.attempts', status.attempts) : null;

  let tone = 'text-muted';
  let lines: string[];
  switch (status.kind) {
    case 'behind':
      lines = [tCount('dispatch.lineUp.behind', status.position - 1)];
      break;
    case 'held': {
      const current = driver?.orderIds[0];
      // Offline is the one hold that doesn't clear by itself: someone has to call the driver.
      if (status.hold === 'offline') tone = 'text-warning-soft-foreground font-bold';
      lines = [
        status.hold === 'busy'
          ? current
            ? t('dispatch.lineUp.holdBusy', { order: shortId(current) })
            : t('dispatch.lineUp.holdBusyUnknown')
          : status.hold === 'offer'
            ? t('dispatch.lineUp.holdOffer', { order: shortId(driver?.queue.offeredOrderId ?? undefined) })
            : t('dispatch.lineUp.holdOffline'),
      ];
      if (status.lastError) lines.push(t('dispatch.lineUp.lastRefusal', { reason: reasonOf(status.lastError) }));
      break;
    }
    case 'ready': {
      tone = 'text-queued-soft-foreground font-bold';
      // The runner's next look, when this browser runs it: the one after its last.
      const nextLook = runner.lastTickAt === null ? null : runner.lastTickAt + QUEUE_TICK_MS;
      lines = [
        nextLook !== null && nextLook > now
          ? t('dispatch.lineUp.sendReadyIn', { duration: format.span(nextLook - now) })
          : t('dispatch.lineUp.sendReady'),
      ];
      if (status.lastError) lines.push(t('dispatch.lineUp.lastRefusal', { reason: reasonOf(status.lastError) }));
      break;
    }
    case 'sending':
      tone = 'text-queued-soft-foreground font-bold';
      lines = [t('dispatch.lineUp.holdSending')];
      break;
    case 'retrying':
      tone = 'text-warning-soft-foreground font-bold';
      lines = [
        status.retryAt > now
          ? t('dispatch.lineUp.sendRetrying', {
              reason: reasonOf(status.lastError),
              duration: format.span(status.retryAt - now),
            })
          : t('dispatch.lineUp.sendRetryDue', { reason: reasonOf(status.lastError) }),
      ];
      break;
    case 'offered':
      lines = [
        t('dispatch.lineUp.sendOffered', {
          time: format.clock(isoOf(status.sentAt)),
          ago: format.relative(isoOf(status.sentAt), now),
        }),
      ];
      if (status.expiresAt !== null && status.expiresAt > now) {
        lines.push(t('dispatch.lineUp.offerRunsOut', { duration: format.span(status.expiresAt - now) }));
      }
      break;
    case 'lapsed':
      tone = 'text-danger-soft-foreground font-bold';
      lines = [
        t('dispatch.lineUp.sendLapsed', {
          time: format.clock(isoOf(status.sentAt)),
          ago: format.relative(isoOf(status.sentAt), now),
        }),
      ];
      break;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className={'text-caption tabular ' + tone}>
        {lines.join(' ')}
        {attempts && <span className="text-faint font-normal"> · {attempts}</span>}
      </p>

      {status.kind === 'retrying' && (
        <Button
          variant="secondary"
          size="sm"
          className="w-fit"
          isDisabled={queueActions.isChanging}
          onPress={() => queueActions.onRetry(slot.entry)}
        >
          <RefreshIcon aria-hidden className="size-3.5" />
          {t('dispatch.lineUp.retryNow')}
        </Button>
      )}

      {sendAgain && (status.kind === 'offered' || status.kind === 'lapsed') && (
        <ActionButton label={t('dispatch.lineUp.sendAgain')} isArmed={sendAgain.isArmed} onPress={sendAgain.onPress} />
      )}
    </div>
  );
}

/**
 * The order's place in a driver's queue, in its Driver panel — which is where a
 * dispatcher looks to find out who is taking it. An offer that ran out is shown here too,
 * in red: the order needs a driver again, and the first question is what became of the
 * last one.
 */
function QueueSlot({
  order,
  model,
  now,
  handlers,
  queueActions,
  pending,
  onRequest,
}: {
  order: DispatchOrder;
  model: DispatchModel;
  now: number;
  handlers: QueueHandlers;
  queueActions: QueueActions;
  pending: DispatchRequest | null;
  onRequest: (request: DispatchRequest) => void;
}) {
  const { t } = useI18n();
  const slot = order.queue!;
  const driver = model.driversById.get(slot.driverId);
  const name = driverNameOf(model, slot.driverId, slot.entry.driver?.fullname) ?? t('common.none');
  // Sending again is a hand assign, through the same confirmation strip, to the same driver.
  const canResend = slot.kind !== 'waiting' && driver !== undefined && isAssignable(order) && canSendAgain(driver, order.id);

  return (
    <div className="flex flex-col gap-2">
      <p
        className={
          'text-caption flex items-start gap-2 rounded-lg px-2.5 py-2 font-bold ' +
          (slot.kind === 'lapsed'
            ? 'bg-danger-soft text-danger-soft-foreground'
            : 'bg-queued-soft text-queued-soft-foreground')
        }
      >
        <QueueIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        {slot.kind === 'waiting'
          ? t('dispatch.lineUp.slotWaiting', { position: slot.position, driver: name })
          : slot.kind === 'offered'
            ? t('dispatch.lineUp.slotOffered', { driver: name })
            : t('dispatch.lineUp.slotLapsed', { driver: name })}
      </p>

      {/* No distance on this line: how far they are *now* says nothing about an order
          they collect after the ones ahead of it. */}
      {driver && (
        <DriverLine
          driver={driver}
          now={now}
          distanceTo={null}
          onOpen={() => handlers.onSelect('driver', driver.id)}
          onHover={handlers.onHover}
        />
      )}

      <SendStatusLine
        slot={slot}
        driver={driver}
        queueActions={queueActions}
        sendAgain={
          canResend
            ? {
                isArmed: isArmed(pending, 'assign', order.id, slot.driverId),
                onPress: () => onRequest({ kind: 'assign', orderId: order.id, driverId: slot.driverId }),
              }
            : undefined
        }
      />

      {slot.kind === 'waiting' && (
        <Button
          variant="secondary"
          size="sm"
          className="w-fit"
          isDisabled={queueActions.isChanging || isBeingSent(slot.entry, now)}
          onPress={() => queueActions.onRemove(slot.entry)}
        >
          {t('dispatch.lineUp.remove')}
        </Button>
      )}
    </div>
  );
}

/**
 * A driver's queue, next first: the order sent and not yet accepted, then the line.
 * Each row opens its order; the line can be reordered and trimmed in place.
 */
function UpNext({
  driver,
  model,
  now,
  handlers,
  queueActions,
  pending,
  onRequest,
}: {
  driver: DispatchDriver;
  model: DispatchModel;
  now: number;
  handlers: QueueHandlers;
  queueActions: QueueActions;
  pending: DispatchRequest | null;
  onRequest: (request: DispatchRequest) => void;
}) {
  const { t } = useI18n();
  const { entries, offeredOrderId, offer } = driver.queue;
  if (entries.length === 0 && !offeredOrderId) return null;

  const offered = offeredOrderId ? model.ordersById.get(offeredOrderId) : undefined;
  const canResend =
    offeredOrderId !== null && offered !== undefined && isAssignable(offered) && canSendAgain(driver, offeredOrderId);

  return (
    <Panel title={t('dispatch.lineUp.title')} isFlush>
      <p className="text-micro text-faint border-separator/60 border-b px-3 py-1.5">
        {t('dispatch.lineUp.titleHint')}
      </p>
      <ul className="flex flex-col">
        {offeredOrderId && (
          <li className="border-separator/60 flex items-start gap-2 border-b px-3 py-2">
            <QueueIcon aria-hidden className="text-queued-soft-foreground mt-0.5 size-4 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
              <span className="text-body tabular truncate font-bold">
                #{shortId(offeredOrderId)} · {offered?.row.restaurant?.name ?? t('dispatch.lineUp.unlisted')}
              </span>
              {offer ? (
                <SendStatusLine
                  slot={{ kind: 'offered', entry: offer, driverId: driver.id }}
                  driver={driver}
                  queueActions={queueActions}
                  sendAgain={
                    canResend
                      ? {
                          isArmed: isArmed(pending, 'assign', offeredOrderId, driver.id),
                          onPress: () => onRequest({ kind: 'assign', orderId: offeredOrderId, driverId: driver.id }),
                        }
                      : undefined
                  }
                />
              ) : (
                <span className="text-caption text-muted">{t('dispatch.lineUp.offered')}</span>
              )}
            </span>
          </li>
        )}

        {entries.map((entry, index) => {
          const orderId = entry.order?.objectId ?? '';
          const order = model.ordersById.get(orderId);
          const ahead = entries[index - 1];
          const isSending = isBeingSent(entry, now);
          return (
            <li key={entry.objectId} className="border-separator/60 flex flex-col gap-1 border-b px-3 py-2 last:border-b-0">
              <div className="flex items-center gap-2">
                <Rank value={index + 1} />
                <button
                  type="button"
                  disabled={!order}
                  onClick={() => handlers.onSelect('order', orderId)}
                  onPointerEnter={() => order && handlers.onHover(order.key)}
                  onPointerLeave={() => handlers.onHover(null)}
                  className="hover:bg-surface-secondary focus-visible:ring-focus flex min-w-0 flex-1 flex-col rounded-lg px-1.5 py-0.5 text-start leading-tight transition-colors outline-none focus-visible:ring-2 disabled:hover:bg-transparent"
                >
                  <span className="text-body tabular truncate font-bold">
                    #{shortId(orderId)} · {order?.row.restaurant?.name ?? t('dispatch.lineUp.unlisted')}
                  </span>
                  {order && (
                    <span className="text-caption text-muted truncate">
                      {order.row.user?.fullname ?? t('common.none')}
                    </span>
                  )}
                </button>
                <IconAction
                  label={t('dispatch.lineUp.moveUp')}
                  isDisabled={!ahead || queueActions.isChanging || isSending || isBeingSent(ahead, now)}
                  onPress={() => ahead && queueActions.onMoveUp(entry, ahead)}
                >
                  <ChevronUpIcon className="size-4" />
                </IconAction>
                <IconAction
                  label={t('dispatch.lineUp.remove')}
                  isDisabled={queueActions.isChanging || isSending}
                  onPress={() => queueActions.onRemove(entry)}
                >
                  <CloseIcon className="size-4" />
                </IconAction>
              </div>
              {index === 0 && (
                <span className="ps-8">
                  <SendStatusLine
                    slot={{ kind: 'waiting', entry, driverId: driver.id, position: 1 }}
                    driver={driver}
                    queueActions={queueActions}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function IconAction({
  label,
  isDisabled,
  onPress,
  children,
}: {
  label: string;
  isDisabled: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={isDisabled}
      onClick={onPress}
      className="text-muted hover:text-foreground hover:bg-surface-secondary focus-visible:ring-focus grid size-7 shrink-0 place-items-center rounded-lg transition-colors outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function ActionButton({
  label,
  isArmed,
  onPress,
}: {
  label: string;
  isArmed: boolean;
  onPress: () => void;
}) {
  return (
    <Button variant={isArmed ? 'primary' : 'secondary'} size="sm" onPress={onPress} className="shrink-0">
      {label}
    </Button>
  );
}

function Rank({ value }: { value: number }) {
  return (
    <span
      aria-hidden
      className="bg-surface-tertiary text-caption text-muted grid size-6 shrink-0 place-items-center rounded-full font-bold"
    >
      {value}
    </span>
  );
}

function Avatar({
  name,
  color,
  onColor,
  icon,
  isSmall,
}: {
  name: string;
  color: string;
  onColor: string;
  icon?: ReactNode;
  isSmall?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={
        'grid shrink-0 place-items-center rounded-xl font-bold ' +
        (isSmall ? 'size-8 text-[11px]' : 'size-10 text-caption')
      }
      style={{ backgroundColor: color, color: onColor }}
    >
      {icon ?? initials(name)}
    </span>
  );
}

function PhoneLinks({ phone }: { phone: string | undefined }) {
  const { t } = useI18n();
  const numbers = splitPhones(phone);
  if (numbers.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {numbers.map((number) => (
        <a
          key={number}
          href={`tel:${number.replace(/\s+/g, '')}`}
          className="text-caption text-link border-border/70 hover:bg-surface-secondary focus-visible:ring-focus tabular inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 font-bold transition-colors outline-none focus-visible:ring-2"
        >
          <PhoneIcon aria-hidden className="size-3.5" />
          {number}
          <span className="sr-only">{t('dispatch.detail.call')}</span>
        </a>
      ))}
    </div>
  );
}

function BoardLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="text-caption text-muted hover:text-foreground focus-visible:ring-focus inline-flex w-fit items-center gap-1.5 rounded font-bold transition-colors outline-none focus-visible:ring-2"
    >
      <ExternalLinkIcon aria-hidden className="size-3.5" />
      {label}
    </Link>
  );
}
