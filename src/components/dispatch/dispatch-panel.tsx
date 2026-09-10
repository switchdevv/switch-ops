'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Skeleton } from '@heroui/react';
import { useI18n } from '@/lib/i18n/provider';
import { parseErrorKey } from '@/lib/parse/errors';
import {
  driverMatches,
  orderMatches,
  restaurantMatches,
  type DispatchModel,
  type DispatchSelection,
} from '@/lib/ops/dispatch';
import { ONGOING_WINDOW_HOURS } from '@/lib/services/dispatch';
import type { AssignRequest } from '@/hooks/use-dispatch';
import { LiveControl } from '@/components/ui/live-control';
import { SelectField, type SelectOption } from '@/components/ui/select-field';
import { CloseIcon, SearchIcon } from '@/components/icons';
import { DispatchActionBar, type DispatchFeedback } from './dispatch-action-bar';
import { DispatchDetail } from './dispatch-detail';
import {
  DriverQueue,
  driverSectionId,
  OrderQueue,
  phaseSectionId,
  RestaurantQueue,
  type QueueHandlers,
} from './dispatch-queue';

/**
 * The working half of the screen.
 *
 * Everything that is *done* on this page happens here — the map shows where things are,
 * the panel is where they are decided — so it keeps three things permanently in view: is
 * this live, which region, and the three numbers that say whether anything needs doing.
 * Below that it is either the queue or one thing in detail, never both: a dispatcher
 * reading an order does not need forty others in their peripheral vision, and the map is
 * already carrying the context.
 */

export type LiveState = {
  isLive: boolean;
  isFetching: boolean;
  updatedAt: number;
  onToggle: () => void;
  onRefresh: () => void;
};

export type RegionState = {
  value: string;
  options: SelectOption[];
  isLocked: boolean;
  onChange: (region: string) => void;
};

export type AssignState = {
  pending: AssignRequest | null;
  isSending: boolean;
  feedback: DispatchFeedback | null;
  onRequest: (request: AssignRequest) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onDismiss: () => void;
};

type DispatchTab = 'orders' | 'drivers' | 'restaurants';

export function DispatchPanel({
  model,
  isPending,
  error,
  onRetry,
  total,
  now,
  selection,
  handlers,
  onClearSelection,
  live,
  region,
  assign,
}: {
  model: DispatchModel;
  /** The first load — nothing to show yet, not even stale rows. */
  isPending: boolean;
  error: unknown;
  onRetry: () => void;
  /** How many open orders exist, which can exceed what was fetched. */
  total: number;
  now: number;
  selection: DispatchSelection | null;
  handlers: QueueHandlers;
  onClearSelection: () => void;
  live: LiveState;
  region: RegionState;
  assign: AssignState;
}) {
  const { t, tCount, format } = useI18n();
  const [tab, setTab] = useState<DispatchTab>('orders');
  const [query, setQuery] = useState('');

  const orders = useMemo(
    () => (query ? model.orders.filter((order) => orderMatches(order, query)) : model.orders),
    [model.orders, query],
  );
  const drivers = useMemo(
    () => (query ? model.drivers.filter((driver) => driverMatches(driver, query)) : model.drivers),
    [model.drivers, query],
  );
  const restaurants = useMemo(
    () =>
      query
        ? model.restaurants.filter((restaurant) => restaurantMatches(restaurant, query))
        : model.restaurants,
    [model.restaurants, query],
  );

  const unplaced = useMemo(
    () =>
      model.orders.filter((order) => order.row.deliveryType === 'delivery' && !order.dropoff).length +
      model.drivers.filter((driver) => !driver.location).length,
    [model],
  );

  /**
   * A summary number is only worth showing if it takes you to the rows behind it — so
   * each tile opens its own list and scrolls to its section.
   *
   * The scroll is deferred rather than done here: the section it wants may not exist yet.
   * Clearing a selection goes through the URL, so the queue comes back a render later
   * (and a tab switch, later still). The effect below runs after whichever render finally
   * puts the section on screen.
   */
  const scrollTargetRef = useRef<string | null>(null);

  const jumpTo = useCallback(
    (nextTab: DispatchTab, sectionId: string) => {
      scrollTargetRef.current = sectionId;
      onClearSelection();
      setTab(nextTab);
    },
    [onClearSelection],
  );

  useEffect(() => {
    const target = scrollTargetRef.current;
    if (!target || selection) return;
    const element = document.getElementById(target);
    if (!element) return;
    scrollTargetRef.current = null;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selection, tab, model]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="border-separator/70 flex flex-col gap-3 border-b p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <LiveControl
            isLive={live.isLive}
            onToggle={live.onToggle}
            onRefresh={live.onRefresh}
            isFetching={live.isFetching}
            updatedAt={live.updatedAt}
            now={now}
          />
        </div>

        <SelectField
          label={t('dispatch.region')}
          value={region.value}
          options={region.options}
          isDisabled={region.isLocked}
          onChange={region.onChange}
        />

        <div className="grid grid-cols-3 gap-2">
          <SummaryTile
            label={t('dispatch.kpi.needsDriver')}
            value={format.number(model.counts.needsDriver)}
            color="var(--danger)"
            isActive={model.counts.needsDriver > 0}
            onClick={() => jumpTo('orders', phaseSectionId('needsDriver'))}
          />
          <SummaryTile
            label={t('dispatch.kpi.awaitingRestaurant')}
            value={format.number(model.counts.awaitingRestaurant)}
            note={model.counts.late > 0 ? tCount('dispatch.kpi.late', model.counts.late) : undefined}
            color="var(--warning)"
            isActive={model.counts.awaitingRestaurant > 0}
            onClick={() => jumpTo('orders', phaseSectionId('awaitingRestaurant'))}
          />
          <SummaryTile
            label={t('dispatch.kpi.freeDrivers')}
            value={format.number(model.counts.available)}
            note={model.counts.busy > 0 ? tCount('dispatch.kpi.busy', model.counts.busy) : undefined}
            color="var(--success)"
            isActive={model.counts.available > 0}
            onClick={() => jumpTo('drivers', driverSectionId('available'))}
          />
        </div>
      </header>

      {selection ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <DispatchDetail
            model={model}
            selection={selection}
            now={now}
            handlers={handlers}
            onBack={onClearSelection}
            onRequestAssign={assign.onRequest}
            pendingAssign={assign.pending}
          />
        </div>
      ) : (
        <>
          <div className="border-separator/70 flex flex-col gap-2 border-b p-3">
            <div className="relative">
              <SearchIcon
                aria-hidden
                className="text-muted pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
              />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('dispatch.search.placeholder')}
                aria-label={t('dispatch.search.label')}
                autoComplete="off"
                spellCheck={false}
                className="text-body border-field-border bg-field-background text-field-foreground placeholder:text-field-placeholder focus-visible:ring-focus h-9 w-full rounded-xl border ps-9 pe-9 outline-none focus-visible:ring-2"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={t('dispatch.search.clear')}
                  className="text-muted hover:text-foreground focus-visible:ring-focus absolute end-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-lg outline-none focus-visible:ring-2"
                >
                  <CloseIcon className="size-4" />
                </button>
              )}
            </div>

            <div
              role="tablist"
              aria-label={t('dispatch.tabs.label')}
              className="bg-surface-secondary border-border/70 rounded-pill flex items-center gap-0.5 border p-1"
            >
              <Tab
                isSelected={tab === 'orders'}
                onSelect={() => setTab('orders')}
                label={t('dispatch.tabs.orders')}
                count={format.number(orders.length)}
              />
              <Tab
                isSelected={tab === 'drivers'}
                onSelect={() => setTab('drivers')}
                label={t('dispatch.tabs.drivers')}
                count={format.number(drivers.length)}
              />
              <Tab
                isSelected={tab === 'restaurants'}
                onSelect={() => setTab('restaurants')}
                label={t('dispatch.tabs.restaurants')}
                count={format.number(restaurants.length)}
              />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {isPending ? (
              <QueueSkeleton />
            ) : error ? (
              <div className="p-3">
                <Alert status="danger">
                  <Alert.Content>
                    <Alert.Title>{t('orders.error.title')}</Alert.Title>
                    <Alert.Description>{t(parseErrorKey(error, 'fetch'))}</Alert.Description>
                  </Alert.Content>
                  <Button variant="secondary" size="sm" onPress={onRetry}>
                    {t('common.retry')}
                  </Button>
                </Alert>
              </div>
            ) : tab === 'orders' ? (
              <OrderQueue model={model} orders={orders} now={now} query={query} handlers={handlers} />
            ) : tab === 'drivers' ? (
              <DriverQueue model={model} drivers={drivers} now={now} query={query} handlers={handlers} />
            ) : (
              <RestaurantQueue
                model={model}
                restaurants={restaurants}
                now={now}
                query={query}
                handlers={handlers}
              />
            )}
          </div>

          <footer className="border-separator/70 text-micro text-faint flex flex-col gap-0.5 border-t px-3 py-2">
            <span>
              {total > model.orders.length
                ? t('dispatch.truncated', {
                    shown: format.number(model.orders.length),
                    total: format.number(total),
                  })
                : t('dispatch.window', { hours: ONGOING_WINDOW_HOURS })}
            </span>
            {/* Said here rather than left to be noticed: a customer whose address has no
                pin, or a driver who has not reported one, is in these lists but not on
                the map — and a dispatcher counting pins would come up short. */}
            {unplaced > 0 && <span>{tCount('dispatch.map.unplaced', unplaced)}</span>}
          </footer>
        </>
      )}

      <DispatchActionBar
        pending={assign.pending}
        model={model}
        isSending={assign.isSending}
        feedback={assign.feedback}
        onConfirm={assign.onConfirm}
        onCancel={assign.onCancel}
        onDismiss={assign.onDismiss}
        now={now}
      />
    </div>
  );
}

/**
 * One number, its colour, and the rows behind it.
 *
 * Zero is drawn grey rather than green: on a board people watch all evening, a green nought
 * and a green five look alike at a glance, and the point of the tile is that a non-zero
 * red one is unmistakable.
 */
function SummaryTile({
  label,
  value,
  note,
  color,
  isActive,
  onClick,
}: {
  label: string;
  value: string;
  note?: string;
  color: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="border-border/70 bg-surface-secondary/50 hover:bg-surface-tertiary focus-visible:ring-focus flex flex-col items-start gap-0.5 rounded-xl border px-2.5 py-2 text-start transition-colors outline-none focus-visible:ring-2"
    >
      <span className="flex items-center gap-1.5">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: isActive ? color : 'var(--faint)' }}
        />
        <span
          className="text-h5 tabular font-bold"
          style={{ color: isActive ? color : 'var(--muted)' }}
        >
          {value}
        </span>
      </span>
      <span className="text-micro text-muted leading-tight">{label}</span>
      {note && <span className="text-micro text-faint leading-tight">{note}</span>}
    </button>
  );
}

function Tab({
  isSelected,
  onSelect,
  label,
  count,
}: {
  isSelected: boolean;
  onSelect: () => void;
  label: string;
  count: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      onClick={onSelect}
      // Three to a row in a phone-width sheet: tight padding, and a label that truncates
      // rather than wrapping its count onto a second line.
      className={
        'text-caption rounded-pill focus-visible:ring-focus flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 py-1.5 font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 ' +
        (isSelected ? 'bg-surface text-foreground shadow-card' : 'text-muted hover:text-foreground')
      }
    >
      <span className="truncate">{label}</span>
      <span className={'tabular shrink-0 ' + (isSelected ? 'text-muted' : 'text-faint')}>{count}</span>
    </button>
  );
}

function QueueSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="border-separator/60 flex flex-col gap-1.5 border-b px-3 py-3">
          <Skeleton className="h-3 w-24 rounded-md" />
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-3 w-32 rounded-md" />
        </div>
      ))}
    </div>
  );
}
