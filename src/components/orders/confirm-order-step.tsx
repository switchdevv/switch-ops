'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { Button } from '@heroui/react';
import { useOngoingOrders, useOnlineDrivers } from '@/hooks/use-dispatch';
import { useNow } from '@/hooks/use-now';
import { useDispatchQueue } from '@/hooks/use-queue';
import { shortId } from '@/lib/format';
import { useI18n } from '@/lib/i18n/provider';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { buildDispatchModel, rankDrivers, toLatLng } from '@/lib/ops/dispatch';
import { callsNotDone } from '@/lib/ops/order-calls';
import { canSendDriverOnConfirm } from '@/lib/ops/order-edit';
import { parseErrorKey } from '@/lib/parse/errors';
import type { OrderRow } from '@/types/order';
import { PickupBadge } from '@/components/ui/pickup-badge';
import { AlertIcon, QueueIcon, SignalOffIcon } from '@/components/icons';

/**
 * The question Confirm asks before it goes, on the board and on the map alike.
 *
 * switch-dashboard asks it as a checkbox — "Don't choose a driver" — whose unticked default
 * starts the server's automatic `chooseDriver` search. Dispatch here is manual, so the same
 * question is answered by ops picking the driver: the nearest free ones are listed right in
 * the step, and one tap confirms the order and sends it to them. "No driver yet" confirms
 * only, for when nobody near is free or the restaurant needs a moment.
 *
 * A pickup is never offered a driver: the customer collects it, and the step says so in
 * the pickup's own mark rather than leaving the list out silently.
 */

export type ConfirmableOrder = Pick<
  OrderRow,
  | 'objectId'
  | 'status'
  | 'canceled'
  | 'deliveryType'
  | 'restaurant'
  | 'city'
  | 'driver'
  | 'opsCustomerCall'
  | 'opsRestaurantCall'
>;

/** The driver ops chose, named so the feedback can say who went. */
export type ChosenDriver = { id: string; name: string };

/** How many free drivers are listed before "show all" — the map's own preview length. */
const DRIVER_PREVIEW = 5;

/** No choice made yet, the explicit "no driver", or a driver's id. */
type Choice = null | 'none' | string;

export function ConfirmOrderStep({
  order,
  isPending,
  onCancel,
  onConfirm,
}: {
  order: ConfirmableOrder;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: (driver: ChosenDriver | null) => void;
}) {
  const { t } = useI18n();
  const isPickup = order.deliveryType !== 'delivery';
  const callsLeft = callsNotDone(order);
  // Said, not enforced: a restaurant on the manager app needs no call, and ops may have
  // rung without marking it. But confirming is the step the calls exist to come before.
  const callsLeftKey: MessageKey | null =
    callsLeft.length === 2
      ? 'orders.actions.callsMissing.both'
      : callsLeft[0] === 'customer'
        ? 'orders.actions.callsMissing.customer'
        : callsLeft[0] === 'restaurant'
          ? 'orders.actions.callsMissing.restaurant'
          : null;

  return (
    <div className="border-border/70 bg-surface flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-body font-bold">
            {t('orders.actions.confirmTitle', {
              order: shortId(order.objectId),
              restaurant: order.restaurant?.name ?? t('common.none'),
            })}
          </p>
          {isPickup && <PickupBadge />}
        </div>
        <p className="text-caption text-muted">{t('orders.actions.confirmHint')}</p>
      </div>

      {callsLeftKey && (
        <p className="text-caption bg-warning-soft text-warning-soft-foreground flex items-start gap-2 rounded-lg px-2.5 py-2 font-bold">
          <AlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {t(callsLeftKey)}
        </p>
      )}

      {isPickup ? (
        <>
          <p className="text-caption bg-surface-secondary flex items-start gap-2 rounded-lg px-2.5 py-2">
            {t('orders.actions.pickupNoDriver')}
          </p>
          <StepButtons
            isPending={isPending}
            onCancel={onCancel}
            onConfirm={() => onConfirm(null)}
            label={t('orders.actions.confirm')}
          />
        </>
      ) : canSendDriverOnConfirm(order) ? (
        <DriverChoice order={order} isPending={isPending} onCancel={onCancel} onConfirm={onConfirm} />
      ) : (
        // Assigned early, while it still waited on the restaurant — nothing left to choose.
        <>
          <p className="text-caption text-muted">
            {t('orders.actions.alreadyHasDriver', { driver: order.driver?.fullname ?? t('common.none') })}
          </p>
          <StepButtons
            isPending={isPending}
            onCancel={onCancel}
            onConfirm={() => onConfirm(null)}
            label={t('orders.actions.confirm')}
          />
        </>
      )}
    </div>
  );
}

/**
 * The free drivers nearest the restaurant, by the live map's own model — the same reads,
 * the same "who is free" and the same ranking — so the step can never offer someone the
 * map would grey out. On the map those reads are already cached for the region; on the
 * board they are made while the step is open, and refreshed on the map's clock.
 */
function DriverChoice({
  order,
  isPending,
  onCancel,
  onConfirm,
}: {
  order: ConfirmableOrder;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: (driver: ChosenDriver | null) => void;
}) {
  const { t, format } = useI18n();
  const [choice, setChoice] = useState<Choice>(null);
  const [showAll, setShowAll] = useState(false);
  const now = useNow(15_000);

  const region = order.city?.objectId ?? '';
  const ordersQuery = useOngoingOrders(region, true);
  const driversQuery = useOnlineDrivers(region, true);
  // A queue that can't be read (the class not created yet) only means nobody is queued;
  // it is no reason to withhold the drivers.
  const queueQuery = useDispatchQueue(region, true);

  const model = useMemo(
    () =>
      buildDispatchModel(ordersQuery.data?.results ?? [], driversQuery.data ?? [], queueQuery.data ?? [], now),
    [ordersQuery.data, driversQuery.data, queueQuery.data, now],
  );

  const location = order.restaurant?.location;
  const pickupAt = useMemo(() => toLatLng(location), [location]);
  const candidates = useMemo(() => rankDrivers(pickupAt, model.drivers), [pickupAt, model.drivers]);
  const shown = showAll ? candidates : candidates.slice(0, DRIVER_PREVIEW);

  const slot = model.ordersById.get(order.objectId)?.queue ?? null;
  const queuedBehind = slot && slot.kind !== 'lapsed' ? slot : null;

  const isLoading = ordersQuery.isPending || driversQuery.isPending;
  const loadError = ordersQuery.error ?? driversQuery.error;
  // With nobody to pick, "no driver yet" is the only answer, so it is already given.
  const hasNobody = !isLoading && (loadError !== null || candidates.length === 0);
  const effective: Choice = choice ?? (hasNobody ? 'none' : null);

  // A driver who stopped being free on a refresh (took another order, went offline) is no
  // longer a choice, and the button must not keep their name.
  const chosen =
    effective && effective !== 'none' ? candidates.find(({ item }) => item.id === effective)?.item : undefined;
  const chosenName = chosen ? (chosen.row.fullname ?? chosen.row.username ?? t('common.none')) : null;
  const isNone = effective === 'none';

  if (queuedBehind) {
    return (
      <>
        <p className="text-caption bg-queued-soft text-queued-soft-foreground flex items-start gap-2 rounded-lg px-2.5 py-2 font-bold">
          <QueueIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {t('orders.actions.alreadyQueued', { driver: queuedBehind.entry.driver?.fullname ?? t('common.none') })}
        </p>
        <StepButtons
          isPending={isPending}
          onCancel={onCancel}
          onConfirm={() => onConfirm(null)}
          label={t('orders.actions.confirm')}
        />
      </>
    );
  }

  return (
    <>
      <fieldset className="flex min-w-0 flex-col gap-1.5" disabled={isPending}>
        <legend className="mb-1.5 flex flex-col">
          <span className="text-micro text-muted font-bold tracking-[0.14em] uppercase">
            {t('orders.actions.sendDriver')}
          </span>
          <span className="text-micro text-faint">{t('dispatch.detail.candidatesHint')}</span>
        </legend>

        {isLoading ? (
          <p className="text-caption text-muted px-1 py-1.5">{t('orders.actions.loadingDrivers')}</p>
        ) : loadError ? (
          <p className="text-caption bg-danger-soft text-danger-soft-foreground rounded-lg px-2.5 py-2">
            {t('orders.actions.driversFailed', { reason: t(parseErrorKey(loadError, 'fetch')) })}
          </p>
        ) : candidates.length === 0 ? (
          <p className="text-caption text-muted px-1 py-1.5">{t('dispatch.detail.noCandidates')}</p>
        ) : (
          <>
            {shown.map(({ item, meters }) => (
              <ChoiceRow
                key={item.id}
                name={`confirm-driver-${order.objectId}`}
                isChecked={effective === item.id}
                onCheck={() => setChoice(item.id)}
              >
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="text-body truncate font-bold">
                    {item.row.fullname ?? item.row.username ?? t('common.none')}
                  </span>
                  <span className="text-caption text-muted tabular truncate">
                    {meters === null ? t('dispatch.queue.noPosition') : format.distance(meters)}
                    {item.seenAt !== null
                      ? ` · ${t('dispatch.queue.seen', { time: format.relative(new Date(item.seenAt).toISOString(), now) })}`
                      : ''}
                  </span>
                </span>
                {item.isStale && (
                  <SignalOffIcon
                    aria-label={t('dispatch.driverState.signalLost')}
                    className="text-warning-soft-foreground size-4 shrink-0"
                  />
                )}
              </ChoiceRow>
            ))}
            {candidates.length > DRIVER_PREVIEW && (
              <button
                type="button"
                onClick={() => setShowAll((value) => !value)}
                className="text-caption text-link focus-visible:ring-focus w-fit rounded px-1 font-bold outline-none hover:underline focus-visible:ring-2"
              >
                {showAll
                  ? t('dispatch.detail.showFewer')
                  : t('dispatch.detail.showAll', { count: candidates.length })}
              </button>
            )}
          </>
        )}

        <ChoiceRow
          name={`confirm-driver-${order.objectId}`}
          isChecked={isNone}
          onCheck={() => setChoice('none')}
        >
          <span className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="text-body font-bold">{t('orders.actions.noDriverNow')}</span>
            <span className="text-caption text-muted">{t('orders.actions.noDriverNowHint')}</span>
          </span>
        </ChoiceRow>
      </fieldset>

      <StepButtons
        isPending={isPending}
        onCancel={onCancel}
        isDisabled={!chosen && !isNone}
        onConfirm={() => onConfirm(chosen ? { id: chosen.id, name: chosenName! } : null)}
        label={
          chosenName
            ? t('orders.actions.confirmAndSend', { driver: chosenName })
            : isNone
              ? t('orders.actions.confirmOnly')
              : t('orders.actions.confirm')
        }
      />
    </>
  );
}

function ChoiceRow({
  name,
  isChecked,
  onCheck,
  children,
}: {
  name: string;
  isChecked: boolean;
  onCheck: () => void;
  children: ReactNode;
}) {
  return (
    <label
      className={
        'flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors ' +
        (isChecked ? 'border-accent bg-accent-soft/50' : 'border-border/70 hover:bg-surface-secondary')
      }
    >
      <input type="radio" name={name} checked={isChecked} onChange={onCheck} className="accent-accent size-4 shrink-0" />
      {children}
    </label>
  );
}

function StepButtons({
  isPending,
  isDisabled,
  onCancel,
  onConfirm,
  label,
}: {
  isPending: boolean;
  isDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  label: string;
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button variant="ghost" size="sm" isDisabled={isPending} onPress={onCancel}>
        {t('orders.actions.cancel')}
      </Button>
      <Button variant="primary" size="sm" isPending={isPending} isDisabled={isDisabled} onPress={onConfirm}>
        {isPending ? t('orders.actions.confirming') : label}
      </Button>
    </div>
  );
}
