'use client';

import { Button } from '@heroui/react';
import { shortId } from '@/lib/format';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { useI18n } from '@/lib/i18n/provider';
import {
  aheadOf,
  distanceMeters,
  isAssignable,
  lastStopOf,
  type DispatchModel,
} from '@/lib/ops/dispatch';
import type { DispatchRequest } from '@/hooks/use-dispatch';
import { AlertIcon, CheckIcon, CloseIcon } from '@/components/icons';
import { driverNameOf } from './dispatch-queue';

/**
 * What the last action did, once it is no longer in flight. `change` is an edit to a
 * queue — moving an order up, or taking it out.
 */
export type DispatchFeedback =
  | { kind: 'success'; action: 'assign' | 'queue'; driverName: string; orderId: string }
  | { kind: 'error'; action: 'assign' | 'queue' | 'change'; messageKey: MessageKey };

const FAILED_TITLE: Record<'assign' | 'queue' | 'change', MessageKey> = {
  assign: 'dispatch.action.failed',
  queue: 'dispatch.action.queueFailed',
  change: 'dispatch.lineUp.changeFailed',
};

/**
 * The confirmation strip: one deliberate step between clicking Assign (or Queue) and a
 * driver's phone ringing — now, or the moment they deliver.
 *
 * A strip at the foot of the panel rather than a modal, because dispatch is a rhythm —
 * a dialog that steals focus and has to be dismissed turns twenty assignments an evening
 * into forty interruptions. It still cannot be triggered by a stray double-click: the
 * confirm button appears somewhere the pointer isn't, and it names the driver and the
 * order it is about.
 */
export function DispatchActionBar({
  pending,
  model,
  isSending,
  feedback,
  onConfirm,
  onCancel,
  onDismiss,
  now,
}: {
  pending: DispatchRequest | null;
  model: DispatchModel;
  isSending: boolean;
  feedback: DispatchFeedback | null;
  onConfirm: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  now: number;
}) {
  const { t, tCount, format } = useI18n();

  if (pending) {
    const order = model.ordersById.get(pending.orderId);
    const driver = model.driversById.get(pending.driverId);
    const driverName = driver?.row.fullname ?? driver?.row.username ?? t('common.none');
    const isQueue = pending.kind === 'queue';

    // For a queue, the distance that matters is from where the driver will finish, not
    // from where they are now.
    const from = driver ? (isQueue ? lastStopOf(model, driver) : driver.location) : null;
    const away = from && order?.pickup ? distanceMeters(from, order.pickup) : null;

    // Queueing an order that is already in someone else's line moves it.
    const movingFrom =
      isQueue && order?.queue?.kind === 'waiting' && order.queue.driverId !== pending.driverId
        ? driverNameOf(model, order.queue.driverId, order.queue.entry.driver?.fullname)
        : undefined;

    return (
      <div className="border-separator bg-surface shadow-raised flex flex-col gap-2 border-t p-3">
        <p className="text-body font-bold">
          {t(isQueue ? 'dispatch.action.queueTitle' : 'dispatch.action.assignTitle', {
            driver: driverName,
            order: shortId(pending.orderId),
          })}
        </p>

        {away !== null && (
          <p className="text-caption text-muted tabular">
            {t('dispatch.action.assignDetail', {
              distance: format.distance(away),
              restaurant: order?.row.restaurant?.name ?? t('common.none'),
              // Two orders from one restaurant read the same until the customer is named.
              customer: order?.row.user?.fullname ?? t('common.none'),
            })}
          </p>
        )}

        {isQueue && driver && (
          <p className="text-caption text-muted">
            {tCount('dispatch.lineUp.ahead', aheadOf(driver))} · {t('dispatch.action.queueWhen')}
          </p>
        )}

        {/* The things that make an assignment likely to go wrong, said before it is made
            rather than explained after it fails. */}
        {order && order.phase === 'awaitingRestaurant' && (
          <Warning>{t('dispatch.action.earlyWarning')}</Warning>
        )}
        {!isQueue && driver?.isStale && driver.seenAt !== null && (
          <Warning>
            {t('dispatch.action.staleWarning', {
              duration: format.elapsed(new Date(driver.seenAt).toISOString(), now),
            })}
          </Warning>
        )}
        {movingFrom && <Warning>{t('dispatch.action.queueMove', { driver: movingFrom })}</Warning>}
        {/* Something changed under the dispatcher while the strip was open. */}
        {order && !isAssignable(order) && <Warning>{t('errors.orderTaken')}</Warning>}

        <div className="mt-0.5 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onPress={onCancel} isDisabled={isSending}>
            {t('dispatch.action.cancel')}
          </Button>
          <Button variant="primary" size="sm" onPress={onConfirm} isPending={isSending}>
            {isQueue
              ? t(isSending ? 'dispatch.action.queueSending' : 'dispatch.action.queueConfirm')
              : t(isSending ? 'dispatch.action.sending' : 'dispatch.action.confirm')}
          </Button>
        </div>
      </div>
    );
  }

  if (!feedback) return null;

  const isError = feedback.kind === 'error';

  return (
    <div
      role="status"
      className={
        'flex items-start gap-2 border-t p-3 ' +
        (isError
          ? 'border-danger/30 bg-danger-soft text-danger-soft-foreground'
          : 'border-success/30 bg-success-soft text-success-soft-foreground')
      }
    >
      {isError ? (
        <AlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      ) : (
        <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        {feedback.kind === 'error' ? (
          <>
            <p className="text-caption font-bold">{t(FAILED_TITLE[feedback.action])}</p>
            <p className="text-caption">{t(feedback.messageKey)}</p>
          </>
        ) : (
          <p className="text-caption font-bold">
            {t(feedback.action === 'queue' ? 'dispatch.action.queued' : 'dispatch.action.done', {
              driver: feedback.driverName,
              order: shortId(feedback.orderId),
            })}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('dispatch.action.dismiss')}
        className="hover:bg-surface/40 focus-visible:ring-focus grid size-6 shrink-0 place-items-center rounded-lg transition-colors outline-none focus-visible:ring-2"
      >
        <CloseIcon className="size-3.5" />
      </button>
    </div>
  );
}

function Warning({ children }: { children: string }) {
  return (
    <p className="text-caption bg-warning-soft text-warning-soft-foreground flex items-start gap-2 rounded-lg px-2.5 py-1.5">
      <AlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      {children}
    </p>
  );
}
