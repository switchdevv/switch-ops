'use client';

import { Skeleton } from '@heroui/react';
import { useI18n } from '@/lib/i18n/provider';
import { CALL_STEP_LABEL_KEY, CALL_STEPS, type CallFilter, type CallStep } from '@/lib/ops/order-calls';
import {
  ORDER_STAGES,
  STAGE_COLOR_VAR,
  STAGE_LABEL_KEY,
  type OrderStage,
} from '@/lib/ops/order-status';
import type { CallTallies, StageTallies } from '@/lib/services/orders';
import { PhoneIcon, StoreIcon, UserIcon } from '@/components/icons';

/**
 * Where the period stands, as one bar plus five numbers.
 *
 * A row of separate KPI tiles was the obvious alternative and is worse here: five
 * boxes make five independent facts, while the stacked bar makes one — the *shape* of
 * the queue. A dispatcher glancing at it sees "mostly amber" (a kitchen backing up) or
 * "mostly grey" (a quiet afternoon) before reading a single digit, and that is the
 * question they actually open this page with.
 *
 * The numbers underneath are the filter. Clicking one narrows the list; clicking the
 * one already applied clears it, so a stage is a toggle rather than a trap that
 * requires finding "clear all" to escape.
 *
 * Beside them, the calls still to make: placed orders waiting on the customer's call, and
 * on the restaurant's once the customer confirmed — the part of "New" ops work through by
 * phone. The same kind of toggle.
 */
export function PipelineBar({
  tallies,
  isPending,
  rangeLabel,
  activeStage,
  onSelectStage,
  callTallies,
  activeCalls,
  onSelectCalls,
}: {
  tallies: StageTallies | undefined;
  isPending: boolean;
  rangeLabel: string;
  activeStage: OrderStage | '';
  onSelectStage: (stage: OrderStage | '') => void;
  callTallies: CallTallies | undefined;
  activeCalls: CallFilter | '';
  onSelectCalls: (calls: CallStep | '') => void;
}) {
  const { t, tCount, format } = useI18n();

  const total = tallies
    ? ORDER_STAGES.reduce((sum, stage) => sum + (tallies[stage] ?? 0), 0)
    : 0;

  return (
    <section className="border-border/70 bg-surface rounded-card shadow-card border p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-micro text-muted font-bold tracking-[0.16em] uppercase">
          {t('orders.pipeline.heading')}
        </h2>
        <p className="text-caption text-faint">{t('orders.pipeline.partial')}</p>
      </div>

      <p className="text-body text-muted mt-1">
        {isPending && !tallies
          ? t('common.loading')
          : tCount('orders.pipeline.caption', total, { range: rangeLabel })}
      </p>

      <div className="mt-4">
        {isPending && !tallies ? (
          <Skeleton className="h-2.5 w-full rounded-full" />
        ) : total === 0 ? (
          <div
            aria-hidden
            className="bg-surface-tertiary h-2.5 w-full rounded-full"
            title={t('orders.pipeline.empty')}
          />
        ) : (
          // Decorative: every value in it is repeated as text in the legend below, so
          // announcing the bar too would read the same five numbers twice.
          <div aria-hidden className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full">
            {ORDER_STAGES.map((stage) => {
              const value = tallies?.[stage] ?? 0;
              if (value === 0) return null;
              return (
                <span
                  key={stage}
                  // flexGrow, not a width percentage: a stage holding 1 of 400 orders
                  // still has to be visible, and the min-width floor only works if the
                  // remaining space is shared out rather than assigned absolutely.
                  style={{ flexGrow: value, backgroundColor: STAGE_COLOR_VAR[stage] }}
                  className="min-w-1.5 rounded-full transition-[flex-grow] duration-500"
                />
              );
            })}
          </div>
        )}
      </div>

      {/* The hint is the group's accessible name rather than another line of grey
          text: the buttons already look pressable, and a second caption under a bar
          that already has one is the kind of instruction people stop reading. */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div role="group" aria-label={t('orders.pipeline.hint')} className="flex flex-wrap gap-2">
          {ORDER_STAGES.map((stage) => {
            const value = tallies?.[stage];
            const isActive = activeStage === stage;
            return (
              <button
                key={stage}
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelectStage(isActive ? '' : stage)}
                className={
                  'focus-visible:ring-focus flex items-center gap-2 rounded-xl border px-3 py-2 text-start transition-colors outline-none focus-visible:ring-2 ' +
                  (isActive
                    ? 'border-accent bg-accent-soft text-accent-soft-foreground'
                    : 'border-border/70 bg-surface-secondary/50 hover:bg-surface-tertiary')
                }
              >
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: STAGE_COLOR_VAR[stage] }}
                />
                <span className="flex flex-col leading-tight">
                  <span className="text-caption text-muted">{t(STAGE_LABEL_KEY[stage])}</span>
                  <span className="text-h6 tabular font-bold">
                    {value === undefined ? '—' : format.number(value)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div
          role="group"
          aria-label={t('orders.pipeline.toCallHint')}
          className="border-separator/70 flex flex-wrap items-center gap-2 sm:border-s sm:ps-4"
        >
          <span className="text-micro text-muted flex items-center gap-1.5 font-bold tracking-[0.1em] uppercase">
            <PhoneIcon aria-hidden className="size-3.5" />
            {t('orders.pipeline.toCall')}
          </span>
          {CALL_STEPS.map((step) => {
            const value = callTallies?.[step];
            const isActive = activeCalls === step;
            const Icon = step === 'customer' ? UserIcon : StoreIcon;
            return (
              <button
                key={step}
                type="button"
                aria-pressed={isActive}
                onClick={() => onSelectCalls(isActive ? '' : step)}
                className={
                  'focus-visible:ring-focus flex items-center gap-2 rounded-xl border px-3 py-2 text-start transition-colors outline-none focus-visible:ring-2 ' +
                  (isActive
                    ? 'border-accent bg-accent-soft text-accent-soft-foreground'
                    : 'border-border/70 bg-surface-secondary/50 hover:bg-surface-tertiary')
                }
              >
                {/* Amber while anyone is waiting on that call, as the chips on the rows. */}
                <Icon aria-hidden className={'size-4 shrink-0 ' + (value ? 'text-warning' : 'text-faint')} />
                <span className="flex flex-col leading-tight">
                  <span className="text-caption text-muted">{t(CALL_STEP_LABEL_KEY[step])}</span>
                  <span className="text-h6 tabular font-bold">
                    {value === undefined ? '—' : format.number(value)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
