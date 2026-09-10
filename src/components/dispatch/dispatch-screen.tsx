'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useAccess } from '@/hooks/use-access';
import { useCities } from '@/hooks/use-cities';
import { useAssignDriver, useOngoingOrders, useOnlineDrivers, type AssignRequest } from '@/hooks/use-dispatch';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useNow } from '@/hooks/use-now';
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
import type { SelectOption } from '@/components/ui/select-field';
import { ChevronUpIcon } from '@/components/icons';
import type { DispatchFeedback } from './dispatch-action-bar';
import { DispatchPanel } from './dispatch-panel';
import type { QueueHandlers } from './dispatch-queue';

/**
 * The live map: where every open order, its restaurant, its customer and every driver
 * are right now, and where ops assigns the drivers.
 *
 * This component owns the state the two halves share — what is selected, what is being
 * pointed at, which region, whether it is live — and nothing else. The map draws, the
 * panel decides, and neither knows how the other works.
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

const SHEET_PEEK = '13rem';
const SHEET_OPEN = '74dvh';

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
  const [pendingAssign, setPendingAssign] = useState<AssignRequest | null>(null);
  const [feedback, setFeedback] = useState<DispatchFeedback | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const now = useNow(15_000);
  const isWide = useMediaQuery('(min-width: 1024px)');

  const ordersQuery = useOngoingOrders(region, isLive);
  const driversQuery = useOnlineDrivers(region, isLive);
  const citiesQuery = useCities();
  const assignMutation = useAssignDriver();

  const model = useMemo(
    () => buildDispatchModel(ordersQuery.data?.results ?? [], driversQuery.data ?? [], now),
    [ordersQuery.data, driversQuery.data, now],
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

  /** Selecting anything abandons a confirmation in progress: the strip names an order and
   * a driver, and leaving it armed while the panel moves on is how the wrong one gets
   * assigned. */
  const select = useCallback(
    (next: DispatchSelection | null) => {
      setPendingAssign(null);
      setFeedback(null);
      if (next) setIsSheetOpen(true);
      // The *effective* region, not whatever the URL asked for: a staff account that
      // opened someone else's `?region=` link is looking at their own, and the link they
      // share next should say so.
      navigate(region, next);
    },
    [navigate, region],
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

  const confirmAssign = useCallback(() => {
    if (!pendingAssign) return;
    const request = pendingAssign;
    const driver = model.driversById.get(request.driverId);
    const driverName = driver?.row.fullname ?? driver?.row.username ?? '';

    assignMutation.mutate(request, {
      onSuccess: () => {
        setPendingAssign(null);
        setFeedback({ kind: 'success', driverName, orderId: request.orderId });
      },
      onError: (error) => {
        setPendingAssign(null);
        setFeedback({ kind: 'error', messageKey: parseErrorKey(error, 'dispatch') });
      },
    });
  }, [assignMutation, model, pendingAssign]);

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
      if (pendingAssign) {
        setPendingAssign(null);
        return;
      }
      if (selection) select(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [pendingAssign, selection, select]);

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

  const padding = useMemo(
    () =>
      isWide
        ? WIDE_PADDING
        : { ...NARROW_PADDING, bottom: isSheetOpen ? 260 : 190 },
    [isWide, isSheetOpen],
  );

  const panel = (
    <DispatchPanel
      model={model}
      isPending={ordersQuery.isPending}
      error={ordersQuery.error}
      onRetry={() => {
        void ordersQuery.refetch();
        void driversQuery.refetch();
      }}
      total={ordersQuery.data?.count ?? 0}
      now={now}
      selection={selection}
      handlers={handlers}
      onClearSelection={() => select(null)}
      live={{
        isLive,
        isFetching: ordersQuery.isFetching || driversQuery.isFetching,
        updatedAt: ordersQuery.dataUpdatedAt,
        onToggle: () => setIsLive((live) => !live),
        onRefresh: () => {
          void ordersQuery.refetch();
          void driversQuery.refetch();
        },
      }}
      region={{
        value: region,
        options: regionOptions,
        isLocked: pinnedRegion.length > 0,
        onChange: (next) => navigate(next, null),
      }}
      assign={{
        pending: pendingAssign,
        isSending: assignMutation.isPending,
        feedback,
        onRequest: (request) => {
          setFeedback(null);
          setPendingAssign(request);
        },
        onConfirm: confirmAssign,
        onCancel: () => setPendingAssign(null),
        onDismiss: () => setFeedback(null),
      }}
    />
  );

  return (
    <div className="relative flex h-full min-h-0 w-full">
      {isWide && (
        <aside className="border-border/70 bg-surface z-10 flex h-full w-[24rem] shrink-0 flex-col border-e">
          {panel}
        </aside>
      )}

      <div className="relative min-w-0 flex-1">
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
        <div
          className="border-border/70 bg-surface shadow-raised absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-2xl border-t transition-[height] duration-200"
          style={{ height: isSheetOpen ? SHEET_OPEN : SHEET_PEEK }}
        >
          <button
            type="button"
            onClick={() => setIsSheetOpen((open) => !open)}
            aria-expanded={isSheetOpen}
            className="text-muted hover:text-foreground focus-visible:ring-focus flex w-full shrink-0 items-center justify-center gap-2 py-1.5 outline-none focus-visible:ring-2 focus-visible:ring-inset"
          >
            <span aria-hidden className="bg-border h-1 w-9 rounded-full" />
            <span className="sr-only">
              {t(isSheetOpen ? 'dispatch.sheet.collapse' : 'dispatch.sheet.expand')}
            </span>
            <ChevronUpIcon
              aria-hidden
              className={'size-4 transition-transform ' + (isSheetOpen ? 'rotate-180' : '')}
            />
          </button>
          <div className="min-h-0 flex-1 overflow-hidden">{panel}</div>
        </div>
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
