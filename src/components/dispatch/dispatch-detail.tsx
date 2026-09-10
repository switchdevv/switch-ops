'use client';

import { useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Button } from '@heroui/react';
import { initials, shortId, splitPhones } from '@/lib/format';
import { useI18n } from '@/lib/i18n/provider';
import { basketSize, readBasket } from '@/lib/ops/basket';
import { formatClockTime } from '@/lib/ops/restaurant-hours';
import {
  canTakeOrders,
  distanceMeters,
  DRIVER_COLOR_VAR,
  DRIVER_ON_COLOR_VAR,
  DRIVER_STATE_HINT_KEY,
  DRIVER_STATE_LABEL_KEY,
  isAssignable,
  nextStopOf,
  PHASE_COLOR_VAR,
  PHASE_HINT_KEY,
  PHASE_LABEL_KEY,
  rankDrivers,
  rankOrders,
  type DispatchDriver,
  type DispatchModel,
  type DispatchOrder,
  type DispatchRestaurant,
  type DispatchSelection,
  type LatLng,
  type Ranked,
} from '@/lib/ops/dispatch';
import { ordersHref } from '@/lib/url/order-filters';
import { OrderBasket, OrderPayment } from '@/components/orders/order-contents';
import { CopyValue } from '@/components/ui/copy-value';
import { StageChip } from '@/components/ui/stage-chip';
import {
  ChevronLeftIcon,
  ExternalLinkIcon,
  HomeIcon,
  NoteIcon,
  PhoneIcon,
  SignalOffIcon,
  StoreIcon,
} from '@/components/icons';
import { QueueOrderRow, Tag, type QueueHandlers } from './dispatch-queue';
import { HoursText } from './restaurant-hours-text';
import type { AssignRequest } from '@/hooks/use-dispatch';

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

export type DetailProps = {
  model: DispatchModel;
  selection: DispatchSelection;
  now: number;
  handlers: QueueHandlers;
  onBack: () => void;
  /** Opens the confirmation strip at the foot of the panel. */
  onRequestAssign: (request: AssignRequest) => void;
  /** The assignment awaiting confirmation, so its row can show as armed. */
  pendingAssign: AssignRequest | null;
};

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
  onRequestAssign,
  pendingAssign,
}: DetailProps & { order: DispatchOrder }) {
  const { t, tCount, format } = useI18n();
  const { row } = order;
  const currency = row.city?.currency;

  const driver = order.driverId ? model.driversById.get(order.driverId) : undefined;
  const items = basketSize(readBasket(row));
  const trip = order.pickup && order.dropoff ? distanceMeters(order.pickup, order.dropoff) : null;
  const canAssign = isAssignable(order);

  const candidates = useMemo(
    () => (canAssign ? rankDrivers(order.pickup, model.drivers) : []),
    [canAssign, order.pickup, model.drivers],
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

        <PhaseBadge order={order} />

        <p className="text-caption text-muted">
          {t('dispatch.detail.placed', { time: format.dateTime(row.createdAt) })} ·{' '}
          {format.elapsed(row.createdAt, now)} ·{' '}
          {t(row.deliveryType === 'pickup' ? 'orders.type.pickup' : 'orders.type.delivery')}
          {items > 0 ? ` · ${tCount('orders.row.items', items)}` : ''} ·{' '}
          <span className="text-foreground font-bold">
            {format.money(row.options?.total, currency)}
          </span>
        </p>
      </header>

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

        {row.deliveryType === 'pickup' ? (
          <p className="text-caption text-muted">{t('dispatch.detail.collectedByCustomer')}</p>
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

      <Panel title={t('dispatch.detail.driver')}>
        {driver ? (
          <DriverLine
            driver={driver}
            now={now}
            distanceTo={nextStopOf(order)}
            onOpen={() => handlers.onSelect('driver', driver.id)}
            onHover={handlers.onHover}
          />
        ) : row.deliveryType === 'pickup' ? (
          <p className="text-caption text-muted">{t('dispatch.detail.collectedByCustomer')}</p>
        ) : (
          <p className="text-caption text-danger-soft-foreground bg-danger-soft rounded-lg px-2.5 py-2 font-bold">
            {t('dispatch.detail.noDriverYet')}
          </p>
        )}
      </Panel>

      {canAssign && (
        <CandidateDrivers
          candidates={candidates}
          model={model}
          now={now}
          handlers={handlers}
          orderId={order.id}
          pendingAssign={pendingAssign}
          onRequestAssign={onRequestAssign}
          notice={order.phase === 'awaitingRestaurant' ? t('dispatch.detail.notAcceptedYet') : undefined}
        />
      )}

      {/* Below the dispatch half rather than above it: picking a driver is what this
          panel is for, and a fifteen-line basket above the Assign buttons would push them
          off the screen. The total and item count are already in the header. */}
      <Panel title={t('orders.detail.basket')}>
        <OrderBasket order={row} currency={currency} />
      </Panel>

      <Panel title={t('orders.detail.payment')}>
        <OrderPayment order={row} currency={currency} />
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
  onRequestAssign,
  pendingAssign,
}: DetailProps & { driver: DispatchDriver }) {
  const { t, format } = useI18n();
  const name = driver.row.fullname ?? driver.row.username ?? t('common.none');
  const isAssignableDriver = canTakeOrders(driver);

  const waiting = useMemo(
    () => (isAssignableDriver ? rankOrders(driver.location, model.orders) : []),
    [isAssignableDriver, driver.location, model.orders],
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

      {isAssignableDriver ? (
        <section className="flex flex-col gap-2">
          <SectionTitle title={t('dispatch.detail.nearbyOrders')} hint={t('dispatch.detail.nearbyOrdersHint')} />
          {waiting.length === 0 ? (
            <p className="text-caption text-success-soft-foreground bg-success-soft/60 rounded-lg px-2.5 py-2">
              {t('dispatch.detail.noNearbyOrders')}
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {waiting.slice(0, CANDIDATE_PREVIEW).map(({ item, meters }, index) => (
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
                      <span className="text-body truncate font-bold">
                        {item.row.restaurant?.name ?? t('common.none')}
                      </span>
                      <span className="text-caption text-muted tabular truncate">
                        #{shortId(item.id)} ·{' '}
                        {meters === null ? t('dispatch.queue.noPosition') : format.distance(meters)} ·{' '}
                        {format.elapsed(item.row.createdAt, now)}
                      </span>
                    </span>
                  </button>
                  <AssignButton
                    isArmed={
                      pendingAssign?.orderId === item.id && pendingAssign.driverId === driver.id
                    }
                    onPress={() => onRequestAssign({ orderId: item.id, driverId: driver.id })}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <p className="text-caption text-muted bg-surface-secondary/70 rounded-lg px-2.5 py-2">
          {t(driver.orderIds.length > 0 ? 'dispatch.detail.busyNotice' : 'dispatch.detail.offlineNotice')}
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

function PhaseBadge({ order }: { order: DispatchOrder }) {
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
      <span className="text-micro text-faint">{t(PHASE_HINT_KEY[order.phase])}</span>
    </div>
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
  pendingAssign,
  onRequestAssign,
  notice,
}: {
  candidates: Ranked<DispatchDriver>[];
  model: DispatchModel;
  now: number;
  handlers: QueueHandlers;
  orderId: string;
  pendingAssign: AssignRequest | null;
  onRequestAssign: (request: AssignRequest) => void;
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
                <AssignButton
                  isArmed={pendingAssign?.orderId === orderId && pendingAssign.driverId === item.id}
                  onPress={() => onRequestAssign({ orderId, driverId: item.id })}
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

function AssignButton({ isArmed, onPress }: { isArmed: boolean; onPress: () => void }) {
  const { t } = useI18n();
  return (
    <Button variant={isArmed ? 'primary' : 'secondary'} size="sm" onPress={onPress} className="shrink-0">
      {t('dispatch.detail.assign')}
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
