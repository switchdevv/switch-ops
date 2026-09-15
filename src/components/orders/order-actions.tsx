'use client';

import { useEffect, useId, useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { useConfirmOrder, useEditOrder, useUnassignDriver } from '@/hooks/use-order-actions';
import { shortId } from '@/lib/format';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { useI18n } from '@/lib/i18n/provider';
import {
  buildOrderEdit,
  canConfirm,
  canUnassignDriver,
  draftFrom,
  ORDER_STATUSES,
  parseAmount,
  sumOf,
  type MoneyField,
  type OrderEditDraft,
} from '@/lib/ops/order-edit';
import { statusLabelKey } from '@/lib/ops/order-status';
import { parseErrorKey } from '@/lib/parse/errors';
import type { OrderRow } from '@/types/order';
import { SelectField } from '@/components/ui/select-field';
import { AlertIcon, CheckIcon, CloseIcon } from '@/components/icons';
import { ConfirmOrderStep, type ChosenDriver } from './confirm-order-step';

/**
 * Confirm, Unassign and Edit, for one order — on the board's detail and on the live map's
 * alike.
 *
 * Confirm and Unassign each ask once, inline, before they go: one notifies the customer,
 * the other takes an order off a driver's phone, so neither is something a stray click
 * should do. Edit opens a dialog, because it is a form — the dashboard's status and prices,
 * with the total checked against the amounts above it.
 */

export type ActionableOrder = Pick<
  OrderRow,
  'objectId' | 'status' | 'canceled' | 'deliveryType' | 'options' | 'restaurant' | 'user' | 'city' | 'driver'
>;

type Feedback =
  | { kind: 'success'; messageKey: MessageKey; values?: Record<string, string> }
  | { kind: 'error'; titleKey: MessageKey; messageKey: MessageKey; values?: Record<string, string> };

/**
 * The question open under the buttons. Unassign holds the driver it was asked about, so a
 * refresh that puts someone else on the order closes the question rather than quietly
 * turning it into one about the new driver.
 */
type Armed = { kind: 'confirm' } | { kind: 'unassign'; driver: ChosenDriver } | null;

export function OrderActions({ order, className }: { order: ActionableOrder; className?: string }) {
  const { t } = useI18n();
  const [armed, setArmed] = useState<Armed>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const confirmMutation = useConfirmOrder();
  const unassignMutation = useUnassignDriver();

  const orderNumber = shortId(order.objectId);
  const isConfirmable = canConfirm(order);
  const isUnassignable = canUnassignDriver(order);
  const driverName = order.driver?.fullname ?? t('common.none');
  const unassignFrom = armed?.kind === 'unassign' ? armed.driver : null;
  // Closed the moment the order stops carrying that driver — delivered, cancelled by them,
  // or taken off from another console while the question was open.
  const isUnassignOpen =
    unassignFrom !== null &&
    ((isUnassignable && order.driver?.objectId === unassignFrom.id) || unassignMutation.isPending);

  // A success is worth reading, not keeping — the status chip changes on the re-read.
  // An error stays until dismissed.
  useEffect(() => {
    if (feedback?.kind !== 'success') return;
    const timeout = setTimeout(() => setFeedback(null), 8000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const confirm = (driver: ChosenDriver | null) => {
    confirmMutation.mutate({ order, driverId: driver?.id ?? null }, {
      onSuccess: (outcome) => {
        setArmed(null);
        if (outcome.driver === 'refused') {
          setFeedback({
            kind: 'error',
            titleKey: 'orders.actions.sendRefused',
            messageKey: parseErrorKey(outcome.error, 'dispatch'),
            values: { order: orderNumber, driver: driver?.name ?? '' },
          });
          return;
        }
        setFeedback(
          outcome.driver === 'sent'
            ? { kind: 'success', messageKey: 'orders.actions.confirmedAndSent', values: { driver: driver?.name ?? '' } }
            : { kind: 'success', messageKey: 'orders.actions.confirmed' },
        );
      },
      onError: (error) => {
        setArmed(null);
        setFeedback({
          kind: 'error',
          titleKey: 'orders.actions.confirmFailed',
          messageKey: parseErrorKey(error, 'order'),
        });
      },
    });
  };

  const unassign = (driver: ChosenDriver) => {
    unassignMutation.mutate({ order, driverId: driver.id }, {
      onSuccess: ({ isDriverNotified }) => {
        setArmed(null);
        setFeedback(
          isDriverNotified
            ? { kind: 'success', messageKey: 'orders.actions.unassigned', values: { driver: driver.name } }
            : {
                // The order is off them, but their phone still says otherwise — that is
                // something ops has to act on, so it reads as a problem, and it stays.
                kind: 'error',
                titleKey: 'orders.actions.unassignedNotNotified',
                messageKey: 'orders.actions.unassignedCallDriver',
                values: { order: orderNumber, driver: driver.name },
              },
        );
      },
      onError: (error) => {
        setArmed(null);
        setFeedback({
          kind: 'error',
          titleKey: 'orders.actions.unassignFailed',
          messageKey: parseErrorKey(error, 'order'),
        });
      },
    });
  };

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <div className="flex flex-wrap items-center gap-2">
        {isConfirmable && (
          <Button
            variant="primary"
            size="sm"
            isDisabled={armed?.kind === 'confirm'}
            onPress={() => {
              setFeedback(null);
              setArmed({ kind: 'confirm' });
            }}
          >
            <CheckIcon aria-hidden className="size-4" />
            {t('orders.actions.confirm')}
          </Button>
        )}
        {isUnassignable && (
          <Button
            variant="danger-soft"
            size="sm"
            isDisabled={isUnassignOpen}
            onPress={() => {
              setFeedback(null);
              setArmed({ kind: 'unassign', driver: { id: order.driver!.objectId, name: driverName } });
            }}
          >
            {t('orders.actions.unassign')}
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onPress={() => {
            setFeedback(null);
            setArmed(null);
            setIsEditing(true);
          }}
        >
          {t('orders.actions.edit')}
        </Button>
      </div>

      {/* Gone the moment the order stops being confirmable — the restaurant accepted it
          from the manager app while the question was open. */}
      {armed?.kind === 'confirm' && (isConfirmable || confirmMutation.isPending) && (
        <ConfirmOrderStep
          order={order}
          isPending={confirmMutation.isPending}
          onCancel={() => setArmed(null)}
          onConfirm={confirm}
        />
      )}

      {isUnassignOpen && unassignFrom && (
        <UnassignDriverStep
          order={order}
          driver={unassignFrom}
          isPending={unassignMutation.isPending}
          onCancel={() => setArmed(null)}
          onConfirm={() => unassign(unassignFrom)}
        />
      )}

      {feedback && (
        <div
          role="status"
          className={
            'flex items-start gap-2 rounded-xl p-2.5 ' +
            (feedback.kind === 'error'
              ? 'bg-danger-soft text-danger-soft-foreground'
              : 'bg-success-soft text-success-soft-foreground')
          }
        >
          {feedback.kind === 'error' ? (
            <AlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            {feedback.kind === 'error' ? (
              <>
                <p className="text-caption font-bold">{t(feedback.titleKey, feedback.values)}</p>
                <p className="text-caption">{t(feedback.messageKey)}</p>
              </>
            ) : (
              <p className="text-caption font-bold">
                {t(feedback.messageKey, { order: orderNumber, ...feedback.values })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            aria-label={t('orders.actions.dismiss')}
            className="hover:bg-surface/40 focus-visible:ring-focus grid size-6 shrink-0 place-items-center rounded-lg transition-colors outline-none focus-visible:ring-2"
          >
            <CloseIcon className="size-3.5" />
          </button>
        </div>
      )}

      {/* Mounted only while open, so every opening starts from the order as it is now
          rather than from whatever was typed and abandoned last time. */}
      {isEditing && (
        <EditOrderDialog
          order={order}
          onClose={() => setIsEditing(false)}
          onSaved={() => {
            setIsEditing(false);
            setFeedback({ kind: 'success', messageKey: 'orders.actions.saved' });
          }}
        />
      )}
    </div>
  );
}

/**
 * The question Unassign asks before it goes. Named for the driver it was armed with, and
 * louder once the food has left the restaurant (status 2): the next driver can't collect
 * it from the kitchen any more, so ops should know that before, not after.
 */
function UnassignDriverStep({
  order,
  driver,
  isPending,
  onCancel,
  onConfirm,
}: {
  order: ActionableOrder;
  driver: ChosenDriver;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const isCollected = (order.status ?? 0) >= 2;

  return (
    <div className="border-border/70 bg-surface flex flex-col gap-3 rounded-xl border p-3">
      <div className="flex flex-col gap-1">
        <p className="text-body font-bold">
          {t('orders.actions.unassignTitle', { driver: driver.name, order: shortId(order.objectId) })}
        </p>
        <p className="text-caption text-muted">{t('orders.actions.unassignHint')}</p>
      </div>

      {isCollected && (
        <p className="text-caption bg-warning-soft text-warning-soft-foreground flex items-start gap-2 rounded-lg px-2.5 py-2 font-bold">
          <AlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          {t('orders.actions.unassignCollected', { driver: driver.name })}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" size="sm" isDisabled={isPending} onPress={onCancel}>
          {t('orders.actions.keepDriver')}
        </Button>
        <Button variant="danger" size="sm" isPending={isPending} onPress={onConfirm}>
          {isPending
            ? t('orders.actions.unassigning')
            : t('orders.actions.unassignConfirm', { driver: driver.name })}
        </Button>
      </div>
    </div>
  );
}

/**
 * switch-dashboard's edit dialog: status, canceled, and the order's money.
 *
 * One thing it adds: the total is checked against the amounts above it, by the customer
 * app's own formula, and offered as a one-click fix when they disagree. Changing a price
 * on the dashboard means remembering to redo the sum by hand, and a total that no longer
 * matches its parts is what the driver collects.
 */
function EditOrderDialog({
  order,
  onClose,
  onSaved,
}: {
  order: ActionableOrder;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, format } = useI18n();
  const [draft, setDraft] = useState<OrderEditDraft>(() => draftFrom(order));
  const [invalidField, setInvalidField] = useState<MoneyField | null>(null);
  const editMutation = useEditOrder();

  const isDelivery = order.deliveryType === 'delivery';
  const currency = order.city?.currency;
  const sum = sumOf(draft, isDelivery);
  const total = parseAmount(draft.total);
  const isStateChanged =
    draft.status !== (order.status ?? 0) || draft.canceled !== (order.canceled === true);

  const update = (patch: Partial<OrderEditDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setInvalidField(null);
    editMutation.reset();
  };

  const save = () => {
    const result = buildOrderEdit(order.objectId, order, draft);
    if (!result.ok) {
      setInvalidField(result.field);
      return;
    }
    editMutation.mutate(result.params, { onSuccess: onSaved });
  };

  const amountField = (field: MoneyField, label: string) => (
    <AmountField
      label={label}
      value={draft[field]}
      isInvalid={invalidField === field}
      onChange={(value) => update({ [field]: value })}
    />
  );

  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!editMutation.isPending}
      onOpenChange={(isOpen) => {
        if (!isOpen && !editMutation.isPending) onClose();
      }}
    >
      <Modal.Container size="md">
        <Modal.Dialog>
          <form
            className="flex flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <Modal.Header>
              <Modal.Heading>{t('orders.edit.title', { order: shortId(order.objectId) })}</Modal.Heading>
              <p className="text-caption text-muted">
                {order.restaurant?.name ?? t('common.none')} → {order.user?.fullname ?? t('common.none')}
              </p>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-4">
              <section className="flex flex-col gap-2">
                <div className="grid items-end gap-3 sm:grid-cols-2">
                  <SelectField
                    label={t('orders.edit.status')}
                    value={String(draft.status)}
                    options={ORDER_STATUSES.map((status) => ({
                      value: String(status),
                      label: t(statusLabelKey({ status, deliveryType: order.deliveryType })),
                    }))}
                    onChange={(value) => update({ status: Number(value) })}
                  />
                  <CheckField
                    label={t('orders.edit.canceled')}
                    isChecked={draft.canceled}
                    onChange={(canceled) => update({ canceled })}
                  />
                </div>
                {isStateChanged && (
                  <p className="text-caption bg-warning-soft text-warning-soft-foreground flex items-start gap-2 rounded-lg px-2.5 py-1.5">
                    <AlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    {t('orders.edit.statusHint')}
                  </p>
                )}
              </section>

              <section className="flex flex-col gap-3">
                <h3 className="text-micro text-muted border-separator/70 border-b pb-1.5 font-bold tracking-[0.14em] uppercase">
                  {t('orders.edit.prices')}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {amountField('itemsTotal', t('orders.edit.itemsTotal'))}
                  {amountField('discount', t('orders.edit.discount'))}
                  {isDelivery && amountField('delivery', t('orders.edit.delivery'))}
                  {amountField('service', t('orders.edit.service'))}
                </div>
                {isDelivery && (
                  <CheckField
                    label={t('orders.edit.freeDelivery')}
                    isChecked={draft.freeDelivery}
                    onChange={(freeDelivery) => update({ freeDelivery })}
                  />
                )}

                <div className="border-separator/70 flex flex-col gap-2 border-t pt-3">
                  {amountField('total', t('orders.edit.total'))}
                  {sum !== null && total !== null && sum === total && (
                    <p className="text-caption text-success-soft-foreground flex items-center gap-1.5">
                      <CheckIcon aria-hidden className="size-3.5 shrink-0" />
                      {t('orders.edit.sumMatches')}
                    </p>
                  )}
                  {sum !== null && sum !== total && (
                    <div className="bg-warning-soft text-warning-soft-foreground flex flex-wrap items-center justify-between gap-2 rounded-lg px-2.5 py-1.5">
                      <p className="text-caption flex items-start gap-1.5">
                        <AlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                        {t('orders.edit.sumDiffers', { amount: format.money(sum, currency) })}
                      </p>
                      {sum >= 0 && (
                        <Button variant="secondary" size="sm" onPress={() => update({ total: String(sum) })}>
                          {t('orders.edit.useSum', { amount: format.money(sum, currency) })}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </section>

              {editMutation.isError && (
                <div role="alert" className="bg-danger-soft text-danger-soft-foreground flex items-start gap-2 rounded-xl p-2.5">
                  <AlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-caption font-bold">{t('orders.edit.failed')}</p>
                    <p className="text-caption">{t(parseErrorKey(editMutation.error, 'order'))}</p>
                  </div>
                </div>
              )}
            </Modal.Body>

            <Modal.Footer>
              <Button variant="ghost" size="sm" isDisabled={editMutation.isPending} onPress={onClose}>
                {t('orders.edit.cancel')}
              </Button>
              <Button type="submit" variant="primary" size="sm" isPending={editMutation.isPending}>
                {t(editMutation.isPending ? 'orders.edit.saving' : 'orders.edit.save')}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

/**
 * A whole amount. Text with a numeric keypad rather than `type="number"`, which accepts
 * "1e3" and "12.5", scrolls its value on a stray wheel, and hands back an empty string for
 * both of those without saying why.
 */
function AmountField({
  label,
  value,
  isInvalid,
  onChange,
}: {
  label: string;
  value: string;
  isInvalid: boolean;
  onChange: (value: string) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  const errorId = useId();

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-micro text-muted font-bold tracking-[0.1em] uppercase">
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={isInvalid || undefined}
        aria-describedby={isInvalid ? errorId : undefined}
        className={
          'text-body tabular bg-field-background text-field-foreground focus-visible:ring-focus h-9 w-full rounded-xl border px-3 outline-none focus-visible:ring-2 ' +
          (isInvalid ? 'border-danger' : 'border-field-border')
        }
      />
      {isInvalid && (
        <p id={errorId} className="text-micro text-danger">
          {t('orders.edit.invalidAmount')}
        </p>
      )}
    </div>
  );
}

function CheckField({
  label,
  isChecked,
  onChange,
}: {
  label: string;
  isChecked: boolean;
  onChange: (isChecked: boolean) => void;
}) {
  return (
    <label className="text-body flex h-9 w-fit cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={isChecked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-accent size-4"
      />
      {label}
    </label>
  );
}
