'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useAccess } from '@/hooks/use-access';
import { useCities } from '@/hooks/use-cities';
import { useAssignDriver, useOngoingOrders, useOnlineDrivers, type DispatchRequest } from '@/hooks/use-dispatch';
import { useElementHeight } from '@/hooks/use-element-height';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useNow } from '@/hooks/use-now';
import { useDispatchQueue, useMoveUp, useQueueOrder, useRemoveFromQueue, useRetryQueued } from '@/hooks/use-queue';
import { pinnedRegionId } from '@/lib/auth/access';
import { useI18n } from '@/lib/i18n/provider';
import {
  buildDispatchModel,
  focusOn,
  regionOutline,
  selectionKey,
  type DispatchSelection,
} from '@/lib/ops/dispatch';
import { parseErrorKey } from '@/lib/parse/errors';
import { parseDispatchParams, serializeDispatchParams } from '@/lib/url/dispatch-params';
import { PageToolbar } from '@/components/page-toolbar';
import { LiveControl } from '@/components/ui/live-control';
import { SelectField, type SelectOption } from '@/components/ui/select-field';
import type { DispatchFeedback } from './dispatch-action-bar';
import type { QueueActions } from './dispatch-detail';
import { DispatchPanel } from './dispatch-panel';
import type { QueueHandlers } from './dispatch-queue';
import { DispatchSheet, sheetHeights, type SheetSnap } from './dispatch-sheet';

/**
 * The live map: where every open order, its restaurant, its customer and every driver
 * are right now, and where ops assigns the drivers.
 *
 * This component owns the state the two halves share — what is selected, what is being
 * pointed at, which region, whether it is live, how far the phone's sheet is open — and
 * nothing else. The map draws, the panel decides, and neither knows how the other works.
 */

/** Loaded in the browser only. MapLibre reaches for `window` on import, and this app is
 * a static export whose pages are rendered at build time. */
const DispatchMap = dynamic(() => import('./dispatch-map'), {
  ssr: false,
  loading: () => <MapPlaceholder />,
});

/** How much of the map is covered by furniture — the legend, the controls, and on a
 * phone the sheet — so that a framed order lands where it can be seen. */
const WIDE_PADDING = { top: 60, right: 76, bottom: 44, left: 252 };
const NARROW_PADDING = { top: 64, right: 24, left: 24 };
/** Clearance above the sheet's edge, and what is assumed for the sheet before it has
 * been measured. */
const SHEET_CLEARANCE = 16;
const UNMEASURED_SHEET = 240;

export function DispatchScreen() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { resolvedTheme } = useTheme();

  // next-themes resolves inside an effect, so the first render knows nothing. The map
  // waits rather than being built light and restyled dark a frame later.
  const theme = resolvedTheme === 'dark' ? 'dark' : resolvedTheme === 'light' ? 'light' : null;

  const { region: scope } = useAccess();
  const pinnedRegion = pinnedRegionId(scope);

  const params = useMemo(
    () => parseDispatchParams(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );
  // A staff account's own region wins over whatever the URL asked for, the same way the
  // board pins its filters — see `confineToRegion`.
  const region = pinnedRegion || params.region;
  const selection = params.selection;

  const [isLive, setIsLive] = useState(true);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [pending, setPending] = useState<DispatchRequest | null>(null);
  const [feedback, setFeedback] = useState<DispatchFeedback | null>(null);
  // Half open to start: the list and the map both in view is the screen's point, and the
  // other two stops are one flick away.
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>('half');

  const now = useNow(15_000);
  const isWide = useMediaQuery('(min-width: 1024px)');

  const rootRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const rootHeight = useElementHeight(rootRef, !isWide);
  const summaryHeight = useElementHeight(summaryRef, !isWide);
  const heights = useMemo(
    () => (rootHeight > 0 && summaryHeight > 0 ? sheetHeights(rootHeight, summaryHeight) : null),
    [rootHeight, summaryHeight],
  );

  const ordersQuery = useOngoingOrders(region, isLive);
  const driversQuery = useOnlineDrivers(region, isLive);
  const queueQuery = useDispatchQueue(region, isLive);
  const citiesQuery = useCities();
  const assignMutation = useAssignDriver();
  const queueMutation = useQueueOrder();
  const { mutate: removeFromQueue, isPending: isRemoving } = useRemoveFromQueue();
  const { mutate: moveUp, isPending: isMoving } = useMoveUp();
  const { mutate: retryQueued, isPending: isRetrying } = useRetryQueued();

  const model = useMemo(
    () =>
      buildDispatchModel(
        ordersQuery.data?.results ?? [],
        driversQuery.data ?? [],
        queueQuery.data ?? [],
        now,
      ),
    [ordersQuery.data, driversQuery.data, queueQuery.data, now],
  );

  const focus = useMemo(() => (selection ? focusOn(model, selection) : null), [model, selection]);

  const navigate = useCallback(
    (nextRegion: string, nextSelection: DispatchSelection | null) => {
      router.replace(
        `${pathname}${serializeDispatchParams({ region: nextRegion, selection: nextSelection })}`,
        { scroll: false },
      );
    },
    [pathname, router],
  );

  /** A sheet folded down to its numbers opens far enough to show what was asked for; one
   * the dispatcher already opened stays where they left it. */
  const revealSheet = useCallback(() => {
    setSheetSnap((snap) => (snap === 'peek' ? 'half' : snap));
  }, []);

  /** Selecting anything abandons a confirmation in progress: the strip names an order and
   * a driver, and leaving it armed while the panel moves on is how the wrong one gets
   * assigned. */
  const select = useCallback(
    (next: DispatchSelection | null) => {
      setPending(null);
      setFeedback(null);
      if (next) revealSheet();
      // The *effective* region, not whatever the URL asked for: a staff account that
      // opened someone else's `?region=` link is looking at their own, and the link they
      // share next should say so.
      navigate(region, next);
    },
    [navigate, region, revealSheet],
  );

  const handlers: QueueHandlers = useMemo(
    () => ({
      selectedKey: selectionKey(selection),
      hoveredKey,
      onSelect: (kind, id) => select({ kind, id }),
      onHover: setHoveredKey,
    }),
    [selection, hoveredKey, select],
  );

  const confirm = useCallback(() => {
    if (!pending) return;
    const request = pending;
    const { kind, orderId, driverId } = request;
    const driver = model.driversById.get(driverId);
    const driverName = driver?.row.fullname ?? driver?.row.username ?? '';

    const outcome = {
      onSuccess: () => {
        setPending(null);
        setFeedback({ kind: 'success', action: kind, driverName, orderId });
      },
      onError: (error: unknown) => {
        setPending(null);
        setFeedback({
          kind: 'error',
          action: kind,
          messageKey: parseErrorKey(error, kind === 'assign' ? 'dispatch' : 'queue'),
        });
      },
    } as const;

    if (kind === 'assign') {
      assignMutation.mutate({ orderId, driverId }, outcome);
    } else {
      const cityId = model.ordersById.get(orderId)?.row.city?.objectId ?? null;
      queueMutation.mutate({ orderId, driverId, cityId }, outcome);
    }
  }, [assignMutation, queueMutation, model, pending]);

  const queueActions = useMemo<QueueActions>(() => {
    const onError = (error: unknown) =>
      setFeedback({ kind: 'error', action: 'change', messageKey: parseErrorKey(error, 'queue') });
    return {
      onRemove: (entry) => {
        setFeedback(null);
        removeFromQueue(entry.objectId, { onError });
      },
      onMoveUp: (entry, ahead) => {
        setFeedback(null);
        moveUp({ entry, ahead }, { onError });
      },
      onRetry: (entry) => {
        setFeedback(null);
        retryQueued(entry.objectId, { onError });
      },
      isChanging: isRemoving || isMoving || isRetrying,
    };
  }, [removeFromQueue, moveUp, retryQueued, isRemoving, isMoving, isRetrying]);

  // A success is worth reading, not worth keeping: the order itself turns blue on the
  // next refresh, which is the real confirmation. An error stays until dismissed.
  useEffect(() => {
    if (feedback?.kind !== 'success') return;
    const timeout = setTimeout(() => setFeedback(null), 8000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  // Escape backs out one step: first the confirmation, then the selection.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (pending) {
        setPending(null);
        return;
      }
      if (selection) select(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pending, selection, select]);

  /**
   * The count of orders with nobody carrying them, in the tab title.
   *
   * This screen lives in a background window for hours — that is the point of the Live
   * indicator — and a number in the title is the only part of it visible from another
   * tab. It is why the orders query keeps refreshing when the tab is hidden.
   */
  const needsDriver = model.counts.needsDriver;
  useEffect(() => {
    const base = t('app.title');
    document.title = needsDriver > 0 ? `(${needsDriver}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, [needsDriver, t]);

  const regionOptions = useMemo<SelectOption[]>(() => {
    const cities = citiesQuery.data ?? [];
    const nameOf = (id: string) => cities.find((city) => city.objectId === id)?.name ?? id;
    if (pinnedRegion) return [{ value: pinnedRegion, label: nameOf(pinnedRegion) }];
    return [
      { value: '', label: t('dispatch.allRegions') },
      ...cities.map((city) => ({ value: city.objectId, label: city.name ?? city.objectId })),
    ];
  }, [citiesQuery.data, pinnedRegion, t]);

  const outline = useMemo(() => {
    const city = citiesQuery.data?.find((entry) => entry.objectId === region) ?? null;
    return regionOutline(city);
  }, [citiesQuery.data, region]);

  /**
   * How much of the map's foot the sheet covers once it has settled. Capped at half open:
   * a full sheet hides the map altogether, and what gets framed meanwhile should still be
   * in view when the dispatcher pulls it back down.
   */
  const sheetCover = isWide ? 0 : heights ? Math.min(heights[sheetSnap], heights.half) : UNMEASURED_SHEET;

  const padding = useMemo(
    () => (isWide ? WIDE_PADDING : { ...NARROW_PADDING, bottom: sheetCover + SHEET_CLEARANCE }),
    [isWide, sheetCover],
  );

  const refreshAll = () => {
    void ordersQuery.refetch();
    void driversQuery.refetch();
    void queueQuery.refetch();
  };

  const panel = (
    <DispatchPanel
      model={model}
      isPending={ordersQuery.isPending}
      error={ordersQuery.error}
      onRetry={refreshAll}
      total={ordersQuery.data?.count ?? 0}
      now={now}
      selection={selection}
      handlers={handlers}
      onClearSelection={() => select(null)}
      assign={{
        pending,
        isSending: assignMutation.isPending || queueMutation.isPending,
        feedback,
        onRequest: (request) => {
          setFeedback(null);
          setPending(request);
        },
        onConfirm: confirm,
        onCancel: () => setPending(null),
        onDismiss: () => setFeedback(null),
      }}
      queueActions={queueActions}
      placement={isWide ? 'side' : 'sheet'}
      summaryRef={summaryRef}
      onReveal={isWide ? undefined : revealSheet}
    />
  );

  return (
    <div ref={rootRef} className="relative flex h-full min-h-0 w-full">
      {/* Up in the shell's header, beside the title on a wide screen and between the logo
          and the avatar on a phone: both govern the map as much as the panel, and every
          row they took inside the panel was a row the orders didn't get. */}
      <PageToolbar>
        <LiveControl
          isLive={isLive}
          onToggle={() => setIsLive((live) => !live)}
          onRefresh={refreshAll}
          isFetching={ordersQuery.isFetching || driversQuery.isFetching || queueQuery.isFetching}
          updatedAt={ordersQuery.dataUpdatedAt}
          now={now}
          isCompact
        />
        <SelectField
          label={t('dispatch.region')}
          isLabelHidden
          value={region}
          options={regionOptions}
          isDisabled={pinnedRegion.length > 0}
          onChange={(next) => navigate(next, null)}
          className="flex-1 sm:w-56 sm:flex-none"
        />
      </PageToolbar>

      {isWide && (
        <aside className="border-border/70 bg-surface z-10 flex h-full w-[24rem] shrink-0 flex-col border-e xl:w-[26rem]">
          {panel}
        </aside>
      )}

      {/* `isolate`: every pin carries its own z-index so the urgent ones sit on top, and
          without a stacking context of their own those indexes compete with the sheet's —
          which is how pins came to be drawn over the panel on a phone. The inset tells the
          map's own furniture (attribution, the loading card) where the sheet begins. */}
      <div
        className="relative isolate min-w-0 flex-1"
        style={{ '--ops-map-inset-bottom': `${sheetCover}px` } as CSSProperties}
      >
        {theme ? (
          <DispatchMap
            model={model}
            focus={focus}
            selectedKey={selectionKey(selection)}
            hoveredKey={hoveredKey}
            regionOutline={outline}
            regionKey={region}
            theme={theme}
            locale={locale}
            padding={padding}
            onSelect={select}
            onHover={setHoveredKey}
          />
        ) : (
          <MapPlaceholder />
        )}

        {/* The same hairline the board uses while a filter is in flight — here it means
            the region was switched and these are still the old region's pins. */}
        {ordersQuery.isPlaceholderData && (
          <div
            role="progressbar"
            aria-label={t('orders.list.updating')}
            className="bg-accent-soft absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden"
          >
            <span aria-hidden className="bg-accent ops-indeterminate absolute inset-y-0 start-0 w-1/3" />
          </div>
        )}
      </div>

      {!isWide && (
        <DispatchSheet snap={sheetSnap} heights={heights} onSnapChange={setSheetSnap}>
          {panel}
        </DispatchSheet>
      )}
    </div>
  );
}

function MapPlaceholder() {
  const { t } = useI18n();
  return (
    <div className="bg-surface-secondary/60 absolute inset-0 grid place-items-center">
      <span className="text-caption text-muted">{t('dispatch.map.loading')}</span>
    </div>
  );
}
