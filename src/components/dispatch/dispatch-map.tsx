'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { LngLatBounds, Map as MapLibreMap, type MapMouseEvent, type PaddingOptions } from 'maplibre-gl';
import { shortId } from '@/lib/format';
import type { Locale } from '@/lib/i18n/locales';
import { useI18n } from '@/lib/i18n/provider';
import {
  blankStyle,
  ensureRtlText,
  installOverlays,
  loadBasemapStyle,
  MAP_PALETTE,
  regionFeatures,
  routeFeatures,
  updateOverlays,
  type MapTheme,
  type OverlayData,
} from '@/lib/map/basemap';
import {
  DRIVER_STATE_LABEL_KEY,
  type DispatchModel,
  type DispatchSelection,
  type Focus,
  type LatLng,
} from '@/lib/ops/dispatch';
import { MapControls, MapLegend, type MapLayers } from './map-controls';
import { MapMarker } from './map-marker';
import { CustomerPin, DriverPin, RestaurantPin } from './map-pins';

/**
 * The map half of the dispatch screen.
 *
 * It owns the MapLibre instance and nothing else: what to draw comes in as a built model
 * (lib/ops/dispatch.ts), and what a click means goes out as a selection. That split is
 * what lets the panel beside it keep working — including assigning drivers — when the
 * tiles fail to load, which for a screen that ops runs their evening on matters more than
 * the map itself.
 */

/** Algiers. The only sensible guess before any data or region has arrived. */
const FALLBACK_CENTER: LatLng = { lat: 36.7538, lng: 3.0588 };
const FALLBACK_ZOOM = 10.5;

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Which pin wins when two overlap. Drivers over orders over restaurants, because a
 * dispatcher reaches for a driver; whatever is selected or pointed at wins over all of
 * it. (Hovering also raises a pin through CSS — see `.maplibregl-marker:hover` in
 * globals.css — so the label bubble is never covered by a neighbour.)
 */
const Z = {
  restaurant: 20,
  driverLost: 25,
  customer: 30,
  customerUrgent: 40,
  driverBusy: 45,
  driverAvailable: 50,
  hovered: 70,
  selected: 80,
} as const;

export type DispatchMapProps = {
  model: DispatchModel;
  /** What the current selection lights up, frames and connects. */
  focus: Focus | null;
  selectedKey: string | null;
  hoveredKey: string | null;
  /** The region's service area, drawn and framed. Empty for "all regions". */
  regionOutline: LatLng[];
  /** Changes when the dispatcher switches region — the cue to re-frame. */
  regionKey: string;
  theme: MapTheme;
  locale: Locale;
  /** How much of the map is covered by the panel or sheet, so a framed view lands in the
   * part that can actually be seen. */
  padding: PaddingOptions;
  onSelect: (selection: DispatchSelection | null) => void;
  onHover: (key: string | null) => void;
};

export default function DispatchMap({
  model,
  focus,
  selectedKey,
  hoveredKey,
  regionOutline,
  regionKey,
  theme,
  locale,
  padding,
  onSelect,
  onHover,
}: DispatchMapProps) {
  const { t, tCount } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retries, setRetries] = useState(0);
  /** Bumped by Retry when the map itself couldn't be built, so the effect below runs again. */
  const [buildAttempt, setBuildAttempt] = useState(0);
  const [layers, setLayers] = useState<MapLayers>(() => ({
    customers: true,
    restaurants: true,
    drivers: true,
    region: true,
  }));

  const palette = MAP_PALETTE[theme];

  // Read inside effects that must not re-run when these change: the camera should not
  // jump because the sheet was opened, and the map must not be rebuilt for a theme.
  const paddingRef = useRef(padding);
  const initialThemeRef = useRef(theme);
  useEffect(() => {
    paddingRef.current = padding;
  }, [padding]);

  const overlayData = useMemo<OverlayData>(
    () => ({
      region: layers.region ? regionFeatures(regionOutline, palette) : EMPTY_COLLECTION,
      routes: routeFeatures(focus?.legs ?? [], palette),
    }),
    [layers.region, regionOutline, palette, focus],
  );

  const overlayRef = useRef(overlayData);
  useEffect(() => {
    overlayRef.current = overlayData;
    if (map) updateOverlays(map, overlayData);
  }, [map, overlayData]);

  // Create the map once. Everything reactive about it happens in the effects below.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    ensureRtlText();

    // MapLibre throws from its constructor when the browser can't give it WebGL — hardware
    // acceleration off, a blocklisted GPU, a phone out of graphics memory. Uncaught, that
    // takes the whole console down; caught, it is the map's own error card with a Retry,
    // and the panel beside it keeps working.
    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container,
        // The real style is fetched and applied by the effect below; starting on a plain
        // page-coloured background means no white flash in dark mode while it arrives.
        style: blankStyle(initialThemeRef.current),
        center: [FALLBACK_CENTER.lng, FALLBACK_CENTER.lat],
        zoom: FALLBACK_ZOOM,
        attributionControl: { compact: true },
        // North up, flat, always. A dispatch map is read out loud to someone on a phone —
        // "north of the roundabout" has to mean the same thing on both screens.
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
        // One city's worth of tiles; copies of the world at the date line would only draw
        // the same order twice.
        renderWorldCopies: false,
      });
    } catch (error) {
      console.error('[dispatch-map] could not create the map', error);
      queueMicrotask(() => setStatus('error'));
      return;
    }
    instance.touchZoomRotate.disableRotation();

    let cancelled = false;
    instance.once('load', () => {
      if (!cancelled) setMap(instance);
    });

    // The container is resized by things MapLibre never hears about: the panel
    // collapsing, the sheet opening, the browser's own devtools.
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container);

    return () => {
      cancelled = true;
      observer.disconnect();
      instance.remove();
    };
  }, [buildAttempt]);

  // The base style, and the theme and language it is drawn in.
  useEffect(() => {
    if (!map) return;
    let cancelled = false;

    loadBasemapStyle(theme, locale)
      .then((style) => {
        if (cancelled) return;
        // `diff: false` so the swap always fires `style.load`, which is what re-installs
        // the console's own sources and layers below.
        map.setStyle(style, { diff: false });
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [map, theme, locale, retries]);

  // Our sources and layers, re-added to every style that loads.
  useEffect(() => {
    if (!map) return;
    const install = () => installOverlays(map, overlayRef.current);
    map.on('style.load', install);
    if (map.isStyleLoaded()) install();
    return () => {
      map.off('style.load', install);
    };
  }, [map]);

  // Clicking the map itself clears the selection. Clicks that landed on a pin have
  // already selected it — they reach here too, because markers live inside the map's own
  // drag surface.
  useEffect(() => {
    if (!map) return;
    const handleClick = (event: MapMouseEvent) => {
      const target = event.originalEvent.target;
      if (target instanceof Element && target.closest('.maplibregl-marker')) return;
      onSelect(null);
    };
    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [map, onSelect]);

  /* ---- the camera ------------------------------------------------------------
     Three moves, each made once: frame the region when it changes, frame the data the
     first time it arrives, and frame a selection when it changes. Never on a refresh —
     a map that re-centred itself every fifteen seconds would be unusable for the one
     thing this screen is for, which is looking closely at a corner of a city. */

  const currentRegionRef = useRef<string | null>(null);
  const framedOutlineRef = useRef(false);
  const framedDataRef = useRef(false);
  const framedSelectionRef = useRef<string | null>(null);

  const placedPoints = useMemo(() => {
    const points: LatLng[] = [];
    for (const restaurant of model.restaurants) if (restaurant.location) points.push(restaurant.location);
    for (const order of model.orders) if (order.dropoff) points.push(order.dropoff);
    for (const driver of model.drivers) if (driver.location) points.push(driver.location);
    return points;
  }, [model]);

  // Switching region starts the framing over.
  useEffect(() => {
    if (currentRegionRef.current === regionKey) return;
    currentRegionRef.current = regionKey;
    framedOutlineRef.current = false;
    framedDataRef.current = false;
  }, [regionKey]);

  // The service area, as soon as it is known. Kept conditional on the data not having
  // framed yet: the region list is cached for the tab's lifetime but can still arrive
  // after the orders do, and pulling the camera back out to the whole city at that point
  // would undo the useful view.
  useEffect(() => {
    if (!map || framedOutlineRef.current || framedDataRef.current || selectedKey) return;
    if (regionOutline.length === 0) return;
    framedOutlineRef.current = true;
    frame(map, regionOutline, paddingRef.current, 13);
  }, [map, regionOutline, selectedKey]);

  useEffect(() => {
    if (!map || framedDataRef.current) return;
    // A link straight to an order frames that order instead — see below.
    if (selectedKey) return;
    if (placedPoints.length === 0) return;
    framedDataRef.current = true;
    frame(map, placedPoints, paddingRef.current);
  }, [map, placedPoints, selectedKey]);

  useEffect(() => {
    if (!map) return;
    if (!selectedKey) {
      framedSelectionRef.current = null;
      return;
    }
    if (framedSelectionRef.current === selectedKey) return;
    const points = focus?.points ?? [];
    // Nothing on this selection has a position: leave the camera where the dispatcher
    // put it rather than jumping to the middle of nowhere.
    if (points.length === 0) return;
    framedSelectionRef.current = selectedKey;
    framedDataRef.current = true;
    frame(map, points, paddingRef.current, 15.5);
  }, [map, selectedKey, focus]);

  const fitAll = useCallback(() => {
    if (!map) return;
    const points = placedPoints.length > 0 ? placedPoints : regionOutline;
    frame(map, points, paddingRef.current);
  }, [map, placedPoints, regionOutline]);

  /* ---- pins ------------------------------------------------------------------ */

  const isDimmed = (key: string) => (focus ? !focus.keys.has(key) : false);
  const isShown = (key: string, layerOn: boolean) => layerOn || focus?.keys.has(key) === true;
  const zIndexOf = (key: string, base: number) =>
    key === selectedKey ? Z.selected : key === hoveredKey ? Z.hovered : base;

  const pinProps = (key: string, base: number, selection: DispatchSelection) => ({
    isSelected: key === selectedKey,
    isDimmed: isDimmed(key),
    isHighlighted: key === hoveredKey,
    onSelect: () => onSelect(selection),
    onHoverChange: (isHovered: boolean) => onHover(isHovered ? key : null),
    zIndex: zIndexOf(key, base),
  });

  return (
    <div className="relative h-full w-full">
      {/* Positioned inline, not with Tailwind: MapLibre's own stylesheet sets
          `position: relative` on this element in an unlayered rule, which beats any
          utility class — and a relatively positioned container here collapses to nothing. */}
      <div
        ref={containerRef}
        className="ops-map"
        style={{ position: 'absolute', inset: 0 }}
        aria-label={t('dispatch.map.label')}
        role="application"
      />

      {map &&
        model.restaurants.map((restaurant) => {
          if (!restaurant.location || !isShown(restaurant.key, layers.restaurants)) return null;
          const { zIndex, ...pin } = pinProps(restaurant.key, Z.restaurant, {
            kind: 'restaurant',
            id: restaurant.id,
          });
          const name = restaurant.row.name ?? t('common.none');
          return (
            <MapMarker key={restaurant.key} map={map} position={restaurant.location} anchor="bottom" zIndex={zIndex}>
              <RestaurantPin
                {...pin}
                phase={restaurant.phase}
                count={restaurant.orderIds.length}
                rank={focus?.ranks.get(restaurant.key)}
                label={name}
                ariaLabel={tCount('dispatch.map.pinRestaurant', restaurant.orderIds.length, { name })}
              />
            </MapMarker>
          );
        })}

      {map &&
        model.orders.map((order) => {
          if (!order.dropoff || !isShown(order.key, layers.customers)) return null;
          const { zIndex, ...pin } = pinProps(
            order.key,
            order.phase === 'needsDriver' ? Z.customerUrgent : Z.customer,
            { kind: 'order', id: order.id },
          );
          const customer = order.row.user?.fullname ?? t('common.none');
          return (
            <MapMarker key={order.key} map={map} position={order.dropoff} anchor="bottom" zIndex={zIndex}>
              <CustomerPin
                {...pin}
                phase={order.phase}
                label={`#${shortId(order.id)} · ${customer}`}
                ariaLabel={t('dispatch.map.pinOrder', { order: shortId(order.id), customer })}
              />
            </MapMarker>
          );
        })}

      {map &&
        model.drivers.map((driver) => {
          if (!driver.location || !isShown(driver.key, layers.drivers)) return null;
          const base =
            driver.state === 'available'
              ? Z.driverAvailable
              : driver.state === 'busy'
                ? Z.driverBusy
                : Z.driverLost;
          const { zIndex, ...pin } = pinProps(driver.key, base, { kind: 'driver', id: driver.id });
          const name = driver.row.fullname ?? driver.row.username ?? t('common.none');
          const state = t(DRIVER_STATE_LABEL_KEY[driver.state]);
          return (
            <MapMarker key={driver.key} map={map} position={driver.location} zIndex={zIndex}>
              <DriverPin
                {...pin}
                state={driver.state}
                rank={focus?.ranks.get(driver.key)}
                label={`${name} · ${state}`}
                ariaLabel={`${name} — ${state}`}
              />
            </MapMarker>
          );
        })}

      <MapLegend layers={layers} onChange={setLayers} counts={model.counts} />
      <MapControls
        onZoomIn={() => map?.zoomIn()}
        onZoomOut={() => map?.zoomOut()}
        onFitAll={fitAll}
      />

      {status !== 'ready' && (
        <div
          className="bg-background/70 pointer-events-none absolute inset-0 z-10 grid place-items-center backdrop-blur-[2px]"
          // Centred in the part of the map a phone's sheet leaves showing, so the retry
          // button isn't underneath it.
          style={{ paddingBottom: 'var(--ops-map-inset-bottom, 0px)' }}
        >
          {status === 'loading' ? (
            <span className="text-caption text-muted bg-surface/90 border-border/70 shadow-card rounded-pill border px-3 py-1.5">
              {t('dispatch.map.loading')}
            </span>
          ) : (
            <div className="bg-surface border-border/70 shadow-card pointer-events-auto mx-4 max-w-sm rounded-2xl border p-5 text-center">
              <p className="text-h6 font-bold">{t('dispatch.map.errorTitle')}</p>
              <p className="text-body text-muted mt-1.5">{t('dispatch.map.errorBody')}</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                onPress={() => {
                  setStatus('loading');
                  if (map) setRetries((count) => count + 1);
                  else setBuildAttempt((count) => count + 1);
                }}
              >
                {t('dispatch.map.retry')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Moves the camera to hold `points`, keeping clear of whatever covers the map.
 *
 * A single point is eased to rather than fitted: `fitBounds` on a zero-size box zooms to
 * the maximum, which drops a dispatcher into a street they can't place.
 */
function frame(map: MapLibreMap, points: LatLng[], padding: PaddingOptions, maxZoom = 14.5) {
  if (points.length === 0) return;
  const safe = clampPadding(map, padding);

  if (points.length === 1) {
    map.easeTo({
      center: [points[0].lng, points[0].lat],
      zoom: Math.max(map.getZoom(), maxZoom),
      padding: safe,
      duration: 650,
    });
    return;
  }

  const bounds = new LngLatBounds();
  for (const point of points) bounds.extend([point.lng, point.lat]);
  map.fitBounds(bounds, { padding: safe, maxZoom, duration: 650 });
}

/** Whatever the furniture covers, each axis keeps at least this share of the map to frame
 * in — and never fewer pixels than the floor. */
const MIN_FRAME_RATIO = 0.25;
const MIN_FRAME_PX = 64;

/** Padding larger than the map cannot be satisfied: MapLibre gives up and the camera
 * doesn't move at all, which reads as a broken button. So padding is honoured as asked
 * while it leaves room to frame in, and otherwise both sides of that axis give way in
 * proportion. Not a flat cap per side: a phone's half-open sheet covers more than half the
 * map on its own, and capping it would frame the selection underneath the sheet.
 * (MapLibre's own `PaddingOptions` leaves every side optional; an unset side is no
 * padding.) */
function clampPadding(map: MapLibreMap, padding: PaddingOptions): PaddingOptions {
  const { clientWidth, clientHeight } = map.getContainer();
  const [top, bottom] = fitAxis(padding.top, padding.bottom, clientHeight);
  const [left, right] = fitAxis(padding.left, padding.right, clientWidth);
  return { top, bottom, left, right };
}

function fitAxis(start: number | undefined, end: number | undefined, size: number): [number, number] {
  const before = Math.max(0, start ?? 0);
  const after = Math.max(0, end ?? 0);
  const room = Math.max(0, size - Math.max(MIN_FRAME_PX, size * MIN_FRAME_RATIO));
  const total = before + after;
  if (total <= room) return [before, after];
  const scale = room / total;
  return [Math.floor(before * scale), Math.floor(after * scale)];
}
