'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { flushSync } from 'react-dom';
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
import type { DispatchRequest } from '@/hooks/use-dispatch';
import { useQueueRunnerStatus } from '@/components/queue-runner';
import { QueueRunnerHealth, QueueRunnerStallBanner } from './queue-runner-health';
import { AlertIcon, CheckIcon, CloseIcon, SearchIcon } from '@/components/icons';
import { DispatchActionBar, type DispatchFeedback } from './dispatch-action-bar';
import { DispatchDetail, type QueueActions } from './dispatch-detail';
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
 * the panel is where they are decided — so the rows get the height. What stays in view
 * above them is one strip of three numbers that say whether anything needs doing, and on
 * the list the filter and the tabs; Live and the region sit in the page header, since they
 * govern the map as much as this. Below that it is either the queue or one thing in
 * detail, never both: a dispatcher reading an order does not need forty others in their
 * peripheral vision, and the map is already carrying the context.
 *
 * The same panel sits beside the map on a wide screen and in a sheet over it on a phone;
 * `placement` is the difference.
 */

/** The confirm-first actions — Assign and Queue — and what the last one did. */
export type AssignState = {
  pending: DispatchRequest | null;
  isSending: boolean;
  feedback: DispatchFeedback | null;
  onRequest: (request: DispatchRequest) => void;
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
  assign,
  queueActions,
  placement,
  summaryRef,
  onReveal,
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
  assign: AssignState;
  queueActions: QueueActions;
  placement: 'side' | 'sheet';
  /** The top of the panel a folded sheet still shows — the banners and the numbers. */
  summaryRef?: Ref<HTMLDivElement>;
  /** Asks a folded sheet to open, for a tap whose answer is further down the panel. */
  onReveal?: () => void;
}) {
  const { t, tCount, format } = useI18n();
  const runner = useQueueRunnerStatus();
  const [tab, setTab] = useState<DispatchTab>('orders');
  const [query, setQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const isSheet = placement === 'sheet';
  // In the sheet the filter waits behind an icon beside the tabs. It is for finding the one
  // order a caller is asking about, not for the scanning the list is mostly used for, and a
  // phone has no row to spare for it. Beside the map there is room, and a box to click
  // straight into.
  const isSearchShown = !isSheet || isSearchOpen || query !== '';

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
   * each one opens its own list and scrolls to its section.
   *
   * The scroll is deferred rather than done here: the section it wants may not exist yet.
   * Clearing a selection goes through the URL, so the queue comes back a render later
   * (and a tab switch, later still). The effect below runs after whichever render finally
   * puts the list on screen — and `jumps` makes sure there is one, for a tap on the tab
   * already showing, which changes nothing else.
   */
  const scrollTargetRef = useRef<string | null>(null);
  const [jumps, setJumps] = useState(0);

  const jumpTo = useCallback(
    (nextTab: DispatchTab, sectionId: string) => {
      scrollTargetRef.current = sectionId;
      setJumps((count) => count + 1);
      onClearSelection();
      setTab(nextTab);
      onReveal?.();
    },
    [onClearSelection, onReveal],
  );

  useEffect(() => {
    const target = scrollTargetRef.current;
    const list = listRef.current;
    if (!target || selection || !list || isPending) return;
    scrollTargetRef.current = null;
    // A zero has no section behind it; the top of the list is the nearest thing. Resolved
    // now rather than left waiting, or the jump would fire whenever that section next
    // appeared, minutes later.
    const element = document.getElementById(target);
    // The list's own scroller rather than `scrollIntoView`, which scrolls every clipping
    // ancestor as well — and in a sheet still opening, one of those is the sheet.
    list.scrollTo({ top: element ? element.offsetTop : 0, behavior: 'smooth' });
  }, [selection, tab, model, jumps, isPending]);

  const toggleSearch = () => {
    if (isSearchShown) {
      setQuery('');
      setIsSearchOpen(false);
      return;
    }
    // Rendered and focused inside the tap itself: a phone only raises its keyboard for a
    // focus it can trace to the user's gesture.
    flushSync(() => setIsSearchOpen(true));
    searchRef.current?.focus();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={'shrink-0 ' + (selection ? 'border-separator/70 border-b pb-3' : 'pb-2')}>
        <div ref={summaryRef}>
          {/* Above everything, list and detail alike, and inside what a folded sheet still
              shows: queued orders silently not going out is the one failure of this screen
              nobody would otherwise notice. */}
          {runner.errorKey && (
            <p
              role="alert"
              className="text-caption bg-warning-soft text-warning-soft-foreground border-separator/70 flex items-start gap-2 border-b px-3 py-2 font-bold"
            >
              <AlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
              {t('dispatch.lineUp.runnerError', { reason: t(runner.errorKey) })}
            </p>
          )}
          {model.counts.queued > 0 && <QueueRunnerStallBanner />}

          <div className={'px-3 ' + (isSheet ? 'pt-0.5' : 'pt-3')}>
            <SummaryStrip model={model} onJump={jumpTo} />
          </div>
        </div>
      </div>

      {selection ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <DispatchDetail
            model={model}
            selection={selection}
            now={now}
            handlers={handlers}
            onBack={onClearSelection}
            onRequest={assign.onRequest}
            pending={assign.pending}
            queueActions={queueActions}
          />
        </div>
      ) : (
        <>
          <div className="border-separator/70 flex shrink-0 flex-col gap-2 border-b px-3 pb-3">
            {isSearchShown && (
              <div className="relative">
                <SearchIcon
                  aria-hidden
                  className="text-muted pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
                />
                <input
                  ref={searchRef}
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
            )}

            <div className="flex items-center gap-2">
              <div
                role="tablist"
                aria-label={t('dispatch.tabs.label')}
                className="bg-surface-secondary border-border/70 rounded-pill flex min-w-0 flex-1 items-center gap-0.5 border p-1"
              >
                <Tab
                  isSelected={tab === 'orders'}
                  onSelect={() => setTab('orders')}
                  label={t('dispatch.tabs.orders')}
                  count={format.number(orders.length)}
                  isFluid={isSheet}
                />
                <Tab
                  isSelected={tab === 'drivers'}
                  onSelect={() => setTab('drivers')}
                  label={t('dispatch.tabs.drivers')}
                  count={format.number(drivers.length)}
                  isFluid={isSheet}
                />
                <Tab
                  isSelected={tab === 'restaurants'}
                  onSelect={() => setTab('restaurants')}
                  label={t('dispatch.tabs.restaurants')}
                  count={format.number(restaurants.length)}
                  isFluid={isSheet}
                />
              </div>

              {isSheet && (
                <button
                  type="button"
                  onClick={toggleSearch}
                  aria-label={t(isSearchShown ? 'dispatch.search.close' : 'dispatch.search.label')}
                  aria-expanded={isSearchShown}
                  className={
                    'rounded-pill focus-visible:ring-focus grid size-9 shrink-0 place-items-center border transition-colors outline-none focus-visible:ring-2 ' +
                    (isSearchShown
                      ? 'border-accent/40 bg-accent-soft text-accent-soft-foreground'
                      : 'border-border/70 bg-surface-secondary text-muted hover:text-foreground')
                  }
                >
                  {isSearchShown ? <CloseIcon className="size-4" /> : <SearchIcon className="size-4" />}
                </button>
              )}
            </div>
          </div>

          {/* `relative` so a section's offsetTop is measured from here — see the jump above. */}
          <div ref={listRef} className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
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
            ) : (
              <>
                {tab === 'orders' ? (
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

                {/* Footnotes, after the last row rather than pinned under the list: each is
                    worth reading once, and none is worth a row of every screenful. The one
                    that needs acting on — the queue no longer being checked — is the
                    banner at the top. */}
                <p className="text-micro text-faint flex flex-col gap-0.5 px-3 pt-3 pb-4">
                  <span>
                    {total > model.orders.length
                      ? t('dispatch.truncated', {
                          shown: format.number(model.orders.length),
                          total: format.number(total),
                        })
                      : t('dispatch.window', { hours: ONGOING_WINDOW_HOURS })}
                  </span>
                  {/* A customer whose address has no pin, or a driver who has not reported
                      one, is in these lists but not on the map — and a dispatcher counting
                      pins would come up short. */}
                  {unplaced > 0 && <span>{tCount('dispatch.map.unplaced', unplaced)}</span>}
                  {/* The queue's one real limit: it runs in the console, so with every
                      console closed nothing goes out. */}
                  {model.counts.queued > 0 && (
                    <>
                      <span>{t('dispatch.lineUp.runnerNote')}</span>
                      <QueueRunnerHealth />
                    </>
                  )}
                </p>
              </>
            )}
          </div>
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
 * The three numbers — orders nobody is carrying, orders the restaurant hasn't accepted,
 * drivers free to take one — as one strip, a row of text tall rather than three cards.
 *
 * Each still opens the rows behind it. The line under the list that used to say "every
 * accepted delivery has a driver" is folded in here too: a tick beside the zero.
 */
function SummaryStrip({
  model,
  onJump,
}: {
  model: DispatchModel;
  onJump: (tab: DispatchTab, sectionId: string) => void;
}) {
  const { t, tCount, format } = useI18n();
  const { counts } = model;

  return (
    <div
      role="group"
      aria-label={t('dispatch.kpi.label')}
      className="border-border/70 bg-surface-secondary/50 divide-border/70 grid grid-cols-3 divide-x overflow-hidden rounded-xl border"
    >
      <SummaryCell
        label={t('dispatch.kpi.needsDriver')}
        value={format.number(counts.needsDriver)}
        // Queued orders left this number when ops chose their driver; said beside it, so
        // the red count dropping reads as work handled rather than work lost.
        note={counts.queued > 0 ? tCount('dispatch.kpi.queued', counts.queued) : undefined}
        color="var(--danger)"
        isActive={counts.needsDriver > 0}
        doneLabel={
          counts.needsDriver === 0 && model.orders.length > 0 ? t('dispatch.queue.allAssigned') : undefined
        }
        onClick={() =>
          onJump(
            'orders',
            phaseSectionId(counts.needsDriver === 0 && counts.queued > 0 ? 'queued' : 'needsDriver'),
          )
        }
      />
      <SummaryCell
        label={t('dispatch.kpi.awaitingRestaurant')}
        value={format.number(counts.awaitingRestaurant)}
        note={counts.late > 0 ? tCount('dispatch.kpi.late', counts.late) : undefined}
        color="var(--warning)"
        isActive={counts.awaitingRestaurant > 0}
        onClick={() => onJump('orders', phaseSectionId('awaitingRestaurant'))}
      />
      <SummaryCell
        label={t('dispatch.kpi.freeDrivers')}
        value={format.number(counts.available)}
        note={counts.busy > 0 ? tCount('dispatch.kpi.busy', counts.busy) : undefined}
        color="var(--success)"
        isActive={counts.available > 0}
        onClick={() => onJump('drivers', driverSectionId('available'))}
      />
    </div>
  );
}

/**
 * One number, its colour, and the rows behind it.
 *
 * Zero is drawn grey rather than green: on a board people watch all evening, a green nought
 * and a green five look alike at a glance, and the point is that a non-zero red one is
 * unmistakable. "Done" is a tick instead, which no count can be mistaken for.
 */
function SummaryCell({
  label,
  value,
  note,
  color,
  isActive,
  doneLabel,
  onClick,
}: {
  label: string;
  value: string;
  note?: string;
  color: string;
  isActive: boolean;
  /** Set when a zero here is the goal reached, and says so. */
  doneLabel?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={doneLabel}
      className="hover:bg-surface-tertiary focus-visible:ring-focus flex min-w-0 flex-col items-start gap-0.5 px-2.5 py-1.5 text-start transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
    >
      <span className="flex w-full min-w-0 items-center gap-1.5">
        {doneLabel ? (
          <CheckIcon aria-hidden className="text-success size-3.5 shrink-0" strokeWidth={2.5} />
        ) : (
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: isActive ? color : 'var(--faint)' }}
          />
        )}
        <span
          className="text-h6 tabular leading-tight font-bold"
          style={{ color: isActive ? color : 'var(--muted)' }}
        >
          {value}
        </span>
        {note && <span className="text-micro text-faint min-w-0 truncate">{note}</span>}
      </span>
      <span className="text-micro text-muted leading-tight">{label}</span>
      {doneLabel && <span className="sr-only">{doneLabel}</span>}
    </button>
  );
}

function Tab({
  isSelected,
  onSelect,
  label,
  count,
  isFluid,
}: {
  isSelected: boolean;
  onSelect: () => void;
  label: string;
  count: string;
  /** Sized by its label, sharing out what is left — for a row too narrow for three equal
   * tabs, where "Restaurants" would be cut to make room "Orders" doesn't need. */
  isFluid?: boolean;
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
        'text-caption rounded-pill focus-visible:ring-focus flex min-w-0 items-center justify-center gap-1.5 px-2 py-1.5 font-bold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 ' +
        (isFluid ? 'flex-auto ' : 'flex-1 ') +
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
