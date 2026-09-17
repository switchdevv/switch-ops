'use client';

import { useState } from 'react';
import { Button, Popover } from '@heroui/react';
import { useRecordCall, useUndoCall } from '@/hooks/use-order-calls';
import { splitPhones } from '@/lib/format';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { useI18n } from '@/lib/i18n/provider';
import {
  CALL_DONE_LABEL_KEY,
  CALL_STEP_LABEL_KEY,
  CALL_STEPS,
  callOf,
  canMarkCalls,
  nextCallDue,
  type CallStep,
  type CallView,
} from '@/lib/ops/order-calls';
import { stageOf } from '@/lib/ops/order-status';
import { parseErrorKey } from '@/lib/parse/errors';
import type { CallEntry, CallOutcome, OrderRow } from '@/types/order';
import { AlertIcon, CheckIcon, PhoneIcon, PhoneMissedIcon, StoreIcon, UserIcon } from '@/components/icons';

/**
 * Ops' two calls on an order — the customer's, then the restaurant's (rules in
 * lib/ops/order-calls.ts) — in the three places an order is worked: two chips on each
 * board row, which open the call in a popover; two cards in an order's detail, on the
 * board and on the map alike; and the same chips, as plain marks, on the map's rows.
 *
 * One panel does the marking everywhere, so the words, the buttons and the Undo are the
 * same whichever way in someone came.
 */

export type CallableOrder = Pick<
  OrderRow,
  'objectId' | 'status' | 'canceled' | 'user' | 'restaurant' | 'opsCustomerCall' | 'opsRestaurantCall'
>;

const STEP_ICON = { customer: UserIcon, restaurant: StoreIcon } as const;

const CHIP_LABEL_KEY: Record<CallStep, MessageKey> = {
  customer: 'orders.calls.chip.customer',
  restaurant: 'orders.calls.chip.restaurant',
};

const ASK_KEY: Record<CallStep, MessageKey> = {
  customer: 'orders.calls.ask.customer',
  restaurant: 'orders.calls.ask.restaurant',
};

const MARK_KEY: Record<CallStep, MessageKey> = {
  customer: 'orders.calls.mark.customer',
  restaurant: 'orders.calls.mark.restaurant',
};

/**
 * Green when the call is done. Amber while someone is waiting on it — the call that is due
 * next, or one nobody answered — the same amber as a placed order's stage, because it is
 * the same wait. Quiet for a call nobody is waiting on yet: the restaurant's, before the
 * customer confirmed, or either on an order already confirmed.
 */
type Tone = 'done' | 'missed' | 'due' | 'todo';

function toneOf(call: CallView, isDue: boolean): Tone {
  if (call.state === 'done') return 'done';
  if (call.state === 'noAnswer') return 'missed';
  return isDue ? 'due' : 'todo';
}

const TONE_CLASS: Record<Tone, string> = {
  done: 'bg-success-soft text-success-soft-foreground',
  missed: 'bg-warning-soft text-warning-soft-foreground',
  due: 'bg-warning-soft text-warning-soft-foreground',
  todo: 'bg-surface-secondary text-muted',
};

const TONE_HOVER_CLASS: Record<Tone, string> = {
  done: 'hover:bg-success-soft-hover',
  missed: 'hover:bg-warning-soft-hover',
  due: 'hover:bg-warning-soft-hover',
  todo: 'hover:bg-surface-tertiary',
};

/** Where a call stands in words: "Confirmed · 14:32 · Karim", "No answer ×2", "To call". */
function useCallStateText() {
  const { t, tCount, format } = useI18n();
  return (step: CallStep, call: CallView, isDue: boolean, withMark = true): string => {
    switch (call.state) {
      case 'done':
        return [
          t(CALL_DONE_LABEL_KEY[step]),
          withMark && call.last ? format.clock(call.last.at) : '',
          withMark ? call.last?.byName : '',
        ]
          .filter(Boolean)
          .join(' · ');
      case 'noAnswer':
        return tCount('orders.calls.missed', Math.max(1, call.missed));
      default:
        return t(isDue ? 'orders.calls.state.due' : 'orders.calls.state.todo');
    }
  };
}

/* ---- chips ------------------------------------------------------------------- */

/**
 * The two calls as one small joined pill: who (a person, a shop) and how it went (a tick,
 * "×2" unanswered, or a dot — amber when it is the call to make now).
 *
 * The icons carry no words so the pill fits a row; the words are in each chip's label,
 * its tooltip, and the panel it opens.
 */
export function CallChips({
  order,
  readOnly = false,
  onLaunched,
  className,
}: {
  order: CallableOrder;
  /** Plain marks rather than buttons, for a row that is itself a button (the map's). */
  readOnly?: boolean;
  /** The restaurant's call was just marked done — the moment to confirm the order. */
  onLaunched?: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  const due = nextCallDue(order);

  return (
    <span
      role="group"
      aria-label={t('orders.calls.heading')}
      className={
        'border-border/70 inline-flex w-fit shrink-0 items-stretch overflow-hidden rounded-lg border ' +
        (className ?? '')
      }
    >
      {CALL_STEPS.map((step, index) =>
        readOnly ? (
          <ChipMark key={step} order={order} step={step} isDue={due === step} isFirst={index === 0} />
        ) : (
          <ChipButton
            key={step}
            order={order}
            step={step}
            isDue={due === step}
            isFirst={index === 0}
            onLaunched={onLaunched}
          />
        ),
      )}
    </span>
  );
}

function chipClass(tone: Tone, isFirst: boolean): string {
  return (
    'text-micro inline-flex h-6 items-center gap-1 px-1.5 font-bold whitespace-nowrap transition-colors ' +
    TONE_CLASS[tone] +
    (isFirst ? '' : ' border-border/70 border-s')
  );
}

function ChipFace({ step, call, isDue }: { step: CallStep; call: CallView; isDue: boolean }) {
  const Icon = STEP_ICON[step];
  return (
    <>
      <Icon aria-hidden className="size-3.5" />
      {call.state === 'done' ? (
        <CheckIcon aria-hidden className="size-3" />
      ) : call.state === 'noAnswer' ? (
        <span aria-hidden className="tabular">
          ×{Math.max(1, call.missed)}
        </span>
      ) : (
        <span
          aria-hidden
          className={'size-1.5 shrink-0 rounded-full ' + (isDue ? 'bg-warning' : 'border border-current opacity-60')}
        />
      )}
    </>
  );
}

function ChipMark({
  order,
  step,
  isDue,
  isFirst,
}: {
  order: CallableOrder;
  step: CallStep;
  isDue: boolean;
  isFirst: boolean;
}) {
  const { t } = useI18n();
  const stateText = useCallStateText();
  const call = callOf(order, step);
  const label = t(CHIP_LABEL_KEY[step], { state: stateText(step, call, isDue) });

  return (
    <span title={label} className={chipClass(toneOf(call, isDue), isFirst)}>
      <ChipFace step={step} call={call} isDue={isDue} />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function ChipButton({
  order,
  step,
  isDue,
  isFirst,
  onLaunched,
}: {
  order: CallableOrder;
  step: CallStep;
  isDue: boolean;
  isFirst: boolean;
  onLaunched?: () => void;
}) {
  const { t } = useI18n();
  const stateText = useCallStateText();
  const [isOpen, setIsOpen] = useState(false);
  const call = callOf(order, step);
  const tone = toneOf(call, isDue);
  const label = t(CHIP_LABEL_KEY[step], { state: stateText(step, call, isDue) });

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger
        tabIndex={0}
        aria-label={label}
        title={label}
        className={
          chipClass(tone, isFirst) +
          ` ${TONE_HOVER_CLASS[tone]} focus-visible:ring-focus cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-inset`
        }
      >
        <ChipFace step={step} call={call} isDue={isDue} />
      </Popover.Trigger>
      <Popover.Content placement="bottom" className="w-[20rem] max-w-[calc(100vw-2rem)]">
        <Popover.Dialog aria-label={label}>
          <CallStepPanel
            order={order}
            step={step}
            onRecorded={(outcome) => {
              // The call is dealt with, so the popover has done its job. After an Undo it
              // stays open: taking a mark back is usually the first half of correcting it.
              setIsOpen(false);
              if (step === 'restaurant' && outcome === 'done') onLaunched?.();
            }}
          />
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

/* ---- the call itself --------------------------------------------------------- */

/**
 * One call: who to ring and on which number, how it went so far, and the two answers —
 * done, or nobody picked up. A mark says when and by whom, and the last one can be taken
 * back while the order can still be marked.
 */
export function CallStepPanel({
  order,
  step,
  number,
  onRecorded,
}: {
  order: CallableOrder;
  step: CallStep;
  /** Its place in the sequence, on the detail's cards. */
  number?: number;
  /** A mark was saved and the screens re-read. */
  onRecorded?: (outcome: CallOutcome) => void;
}) {
  const { t, tCount, format } = useI18n();
  const stateText = useCallStateText();
  const record = useRecordCall();
  const undo = useUndoCall();

  const call = callOf(order, step);
  const isDue = nextCallDue(order) === step;
  const tone = toneOf(call, isDue);
  const isEditable = canMarkCalls(order);
  const Icon = STEP_ICON[step];

  const name = step === 'customer' ? order.user?.fullname : order.restaurant?.name;
  const phones = splitPhones(step === 'customer' ? order.user?.phone : order.restaurant?.phone);
  // Not a lock: ops may know something the order doesn't (the kitchen is closing, say),
  // so the restaurant can still be marked — the panel only says what's out of turn.
  const isOutOfTurn = step === 'restaurant' && callOf(order, 'customer').state !== 'done';

  const pendingOutcome = record.isPending ? record.variables?.outcome : undefined;
  const isBusy = record.isPending || undo.isPending;
  const { last } = call;
  const earlier = call.log.slice(0, -1);

  const entryText = (entry: CallEntry) =>
    entry.outcome === 'done' ? t(CALL_DONE_LABEL_KEY[step]) : t('orders.calls.mark.noAnswer');

  const mark = (outcome: CallOutcome) => {
    undo.reset();
    record.mutate({ orderId: order.objectId, step, outcome }, { onSuccess: () => onRecorded?.(outcome) });
  };

  const takeBack = (entry: CallEntry) => {
    record.reset();
    undo.mutate({ orderId: order.objectId, step, at: entry.at });
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-micro text-muted flex items-center gap-1.5 font-bold tracking-[0.1em] uppercase">
            {number !== undefined && (
              <span
                aria-hidden
                className="bg-surface-tertiary text-foreground tabular grid size-4 shrink-0 place-items-center rounded-full text-[10px] tracking-normal"
              >
                {number}
              </span>
            )}
            <Icon aria-hidden className="size-3.5 shrink-0" />
            {t(CALL_STEP_LABEL_KEY[step])}
          </span>
          <span className="text-body truncate font-bold">{name ?? t('common.none')}</span>
        </div>
        <span
          className={
            'text-micro inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-bold whitespace-nowrap ' +
            TONE_CLASS[tone]
          }
        >
          {call.state === 'done' && <CheckIcon aria-hidden className="size-3" />}
          {call.state === 'noAnswer' && <PhoneMissedIcon aria-hidden className="size-3" />}
          {stateText(step, call, isDue, false)}
        </span>
      </div>

      {phones.length > 0 ? (
        <span className="text-caption flex flex-wrap items-center gap-x-3 gap-y-0.5">
          {phones.map((phone) => (
            // A real `tel:` link: on a laptop it hands off to the softphone, on a phone it
            // dials — the number is the reason this panel exists.
            <a
              key={phone}
              href={`tel:${phone.replace(/\s+/g, '')}`}
              className="text-link tabular inline-flex items-center gap-1 hover:underline"
            >
              <PhoneIcon aria-hidden className="size-3.5" />
              {phone}
            </a>
          ))}
        </span>
      ) : (
        <span className="text-caption text-faint">{t('orders.detail.noPhone')}</span>
      )}

      {last && (
        <div className="text-caption text-muted flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span className="min-w-0">
            {call.state === 'done'
              ? [
                  format.clock(last.at),
                  last.byName,
                  call.missed > 0 ? tCount('orders.calls.afterMissed', call.missed) : '',
                ]
                  .filter(Boolean)
                  .join(' · ')
              : [t('orders.calls.lastTry', { time: format.clock(last.at) }), last.byName].filter(Boolean).join(' · ')}
          </span>
          {isEditable && (
            <button
              type="button"
              onClick={() => takeBack(last)}
              disabled={isBusy}
              aria-label={t('orders.calls.undoLabel', { mark: entryText(last), time: format.clock(last.at) })}
              className="text-link focus-visible:ring-focus rounded font-bold outline-none hover:underline focus-visible:ring-2 disabled:opacity-50"
            >
              {undo.isPending ? '…' : t('orders.calls.undo')}
            </button>
          )}
        </div>
      )}

      {earlier.length > 0 && (
        <p className="text-micro text-faint">
          {t('orders.calls.earlier')}:{' '}
          {earlier
            .map((entry) => `${entryText(entry)} ${format.clock(entry.at)}${entry.byName ? ` (${entry.byName})` : ''}`)
            .join(' · ')}
        </p>
      )}

      {isEditable && call.state !== 'done' && (
        <div className="flex flex-col gap-2">
          {isOutOfTurn && (
            <p className="text-caption text-warning-soft-foreground flex items-center gap-1.5">
              <AlertIcon aria-hidden className="size-3.5 shrink-0" />
              {t('orders.calls.customerFirst')}
            </p>
          )}
          <p className="text-caption text-muted">{t(ASK_KEY[step])}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              isPending={pendingOutcome === 'done'}
              isDisabled={isBusy && pendingOutcome !== 'done'}
              onPress={() => mark('done')}
            >
              <CheckIcon aria-hidden className="size-4" />
              {t(MARK_KEY[step])}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              isPending={pendingOutcome === 'noAnswer'}
              isDisabled={isBusy && pendingOutcome !== 'noAnswer'}
              onPress={() => mark('noAnswer')}
            >
              <PhoneMissedIcon aria-hidden className="size-4" />
              {t('orders.calls.mark.noAnswer')}
            </Button>
          </div>
        </div>
      )}

      {(record.isError || undo.isError) && (
        <p
          role="alert"
          className="text-caption bg-danger-soft text-danger-soft-foreground flex items-start gap-2 rounded-lg px-2.5 py-2"
        >
          <AlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <span className="font-bold">{t(record.isError ? 'orders.calls.failed' : 'orders.calls.undoFailed')}. </span>
            {t(parseErrorKey(record.isError ? record.error : undo.error, 'calls'))}
          </span>
        </p>
      )}
    </div>
  );
}

/* ---- the detail's strip ------------------------------------------------------ */

/**
 * Both calls, in the order they are made, at the top of an order's detail — where ops
 * already are when they read the basket out to the kitchen. Two cards side by side when
 * there is room, stacked in the map's narrow panel.
 *
 * Only while the order is placed, when the calls are the work. After that they are a
 * record, and the detail's height belongs to what comes next — on the map, picking a
 * driver — so they shrink to the row's chips, which still open each call.
 */
export function OrderCalls({ order, onLaunched }: { order: CallableOrder; onLaunched?: () => void }) {
  const { t } = useI18n();

  if (stageOf(order) !== 'new') {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-micro text-muted font-bold tracking-[0.16em] uppercase">{t('orders.calls.heading')}</span>
        <CallChips order={order} onLaunched={onLaunched} />
      </div>
    );
  }

  return (
    <section className="@container flex flex-col gap-2">
      <h3 className="text-micro text-muted font-bold tracking-[0.16em] uppercase">{t('orders.calls.heading')}</h3>
      <div className="grid gap-2 @xl:grid-cols-2">
        {CALL_STEPS.map((step, index) => (
          <div key={step} className="border-border/70 bg-surface rounded-xl border p-3">
            <CallStepPanel
              order={order}
              step={step}
              number={index + 1}
              onRecorded={(outcome) => {
                if (step === 'restaurant' && outcome === 'done') onLaunched?.();
              }}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
