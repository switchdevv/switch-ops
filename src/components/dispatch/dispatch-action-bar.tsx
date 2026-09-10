'use client';

import { Button } from '@heroui/react';
import { shortId } from '@/lib/format';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { useI18n } from '@/lib/i18n/provider';
import { distanceMeters, isAssignable, type DispatchModel } from '@/lib/ops/dispatch';
import type { AssignRequest } from '@/hooks/use-dispatch';
import { AlertIcon, CheckIcon, CloseIcon } from '@/components/icons';

/** What the last assignment did, once it is no longer in flight. */
export type DispatchFeedback =
  | { kind: 'success'; driverName: string; orderId: string }
  | { kind: 'error'; messageKey: MessageKey };

/**
 * The confirmation strip: one deliberate step between clicking Assign and a driver's
 * phone ringing.
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
  pending: AssignRequest | null;
  model: DispatchModel;
  isSending: boolean;
  feedback: DispatchFeedback | null;
  onConfirm: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  now: number;
}) {
  const { t, format } = useI18n();

  if (pending) {
    const order = model.ordersById.get(pending.orderId);
    const driver = model.driversById.get(pending.driverId);
    const driverName = driver?.row.fullname ?? driver?.row.username ?? t('common.none');
    const away =
      driver?.location && order?.pickup ? distanceMeters(driver.location, order.pickup) : null;

    return (
      <div className="border-separator bg-surface shadow-raised flex flex-col gap-2 border-t p-3">
        <p className="text-body font-bold">
          {t('dispatch.action.assignTitle', {
            driver: driverName,
            order: shortId(pending.orderId),
          })}
        </p>

        {away !== null && (
          <p className="text-caption text-muted tabular">
            {t('dispatch.action.assignDetail', {
              distance: format.distance(away),
              restaurant: order?.row.restaurant?.name ?? t('common.none'),
            })}
          </p>
        )}

        {/* The two things that make an assignment likely to go wrong, said before it is
            made rather than explained after it fails. */}
        {order && order.phase === 'awaitingRestaurant' && (
          <Warning>{t('dispatch.action.earlyWarning')}</Warning>
        )}
        {driver?.isStale && driver.seenAt !== null && (
          <Warning>
            {t('dispatch.action.staleWarning', {
              duration: format.elapsed(new Date(driver.seenAt).toISOString(), now),
            })}
          </Warning>
        )}
        {/* Something changed under the dispatcher while the strip was open. */}
        {order && !isAssignable(order) && <Warning>{t('errors.orderTaken')}</Warning>}

        <div className="mt-0.5 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onPress={onCancel} isDisabled={isSending}>
            {t('dispatch.action.cancel')}
          </Button>
          <Button variant="primary" size="sm" onPress={onConfirm} isPending={isSending}>
            {isSending ? t('dispatch.action.sending') : t('dispatch.action.confirm')}
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
        {isError ? (
          <>
            <p className="text-caption font-bold">{t('dispatch.action.failed')}</p>
            <p className="text-caption">{t(feedback.messageKey)}</p>
          </>
        ) : (
          <p className="text-caption font-bold">
            {t('dispatch.action.done', {
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
