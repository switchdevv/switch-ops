'use client';

import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { LngLatBounds, Map as MapLibreMap, Marker, type MapMouseEvent } from 'maplibre-gl';
import type { Locale } from '@/lib/i18n/locales';
import { useI18n } from '@/lib/i18n/provider';
import {
  blankStyle,
  ensureRtlText,
  installOverlays,
  loadBasemapStyle,
  MAP_PALETTE,
  regionFeatures,
  updateOverlays,
  type MapTheme,
  type OverlayData,
} from '@/lib/map/basemap';
import type { LatLng } from '@/lib/ops/dispatch';

/**
 * The restaurant form's map: where drivers collect from.
 *
 * Replaces the dashboard's Google map dialog, whose pin was the map's centre. Here the pin
 * is dropped by clicking the map and dragged to adjust, over the same OpenStreetMap tiles
 * and region outline as the live map. Loaded with `next/dynamic` and `ssr: false`, like
 * that map, because MapLibre touches `window` on import.
 */

/** Algiers, before a region or a pin says otherwise. */
const FALLBACK_CENTER: LatLng = { lat: 36.7538, lng: 3.0588 };
const PIN_ZOOM = 16;

const NO_ROUTES: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export type LocationMapProps = {
  value: LatLng | null;
  onChange: (value: LatLng) => void;
  regionOutline: LatLng[];
  theme: MapTheme;
  locale: Locale;
};

export default function LocationMap({ value, onChange, regionOutline, theme, locale }: LocationMapProps) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retries, setRetries] = useState(0);
  /** Bumped by Retry when the map itself couldn't be built (no WebGL) — see DispatchMap. */
  const [buildAttempt, setBuildAttempt] = useState(0);

  const onChangeRef = useRef(onChange);
  const initialThemeRef = useRef(theme);
  const initialValueRef = useRef(value);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const overlay = useMemo<OverlayData>(
    () => ({ region: regionFeatures(regionOutline, MAP_PALETTE[theme]), routes: NO_ROUTES }),
    [regionOutline, theme],
  );
  const overlayRef = useRef(overlay);
  useEffect(() => {
    overlayRef.current = overlay;
    if (map) updateOverlays(map, overlay);
  }, [map, overlay]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    ensureRtlText();

    const start = initialValueRef.current ?? FALLBACK_CENTER;
    // Throws without WebGL; the form must stay usable (the coordinates can be typed).
    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container,
        style: blankStyle(initialThemeRef.current),
        center: [start.lng, start.lat],
        zoom: initialValueRef.current ? PIN_ZOOM : 11,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
        renderWorldCopies: false,
      });
    } catch (error) {
      console.error('[location-map] could not create the map', error);
      queueMicrotask(() => setStatus('error'));
      return;
    }
    instance.touchZoomRotate.disableRotation();

    let cancelled = false;
    instance.once('load', () => {
      if (!cancelled) setMap(instance);
    });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container);

    return () => {
      cancelled = true;
      observer.disconnect();
      instance.remove();
    };
  }, [buildAttempt]);

  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    loadBasemapStyle(theme, locale)
      .then((style) => {
        if (cancelled) return;
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

  useEffect(() => {
    if (!map) return;
    const install = () => installOverlays(map, overlayRef.current);
    map.on('style.load', install);
    if (map.isStyleLoaded()) install();
    return () => {
      map.off('style.load', install);
    };
  }, [map]);

  // With no pin yet, frame the region the restaurant is in — once, when its outline is
  // known, so a pin can be dropped without first panning across the country.
  const framedRef = useRef(value !== null);
  useEffect(() => {
    if (!map || framedRef.current || regionOutline.length < 3) return;
    framedRef.current = true;
    const bounds = new LngLatBounds();
    for (const point of regionOutline) bounds.extend([point.lng, point.lat]);
    map.fitBounds(bounds, { padding: 24, duration: 0 });
  }, [map, regionOutline]);

  // The pin: a plain draggable element, created once.
  const [marker] = useState(() => {
    const element = document.createElement('div');
    element.className = 'ops-location-pin';
    element.setAttribute('aria-hidden', 'true');
    return new Marker({ element, anchor: 'bottom', draggable: true });
  });

  useEffect(() => {
    if (!map) return;
    const handleDragEnd = () => {
      const { lat, lng } = marker.getLngLat();
      onChangeRef.current({ lat, lng });
    };
    const handleClick = (event: MapMouseEvent) => {
      // A click on the pin itself reaches the map too; it would nudge the pin to wherever
      // on its body the pointer happened to be.
      const target = event.originalEvent.target;
      if (target instanceof Element && target.closest('.maplibregl-marker')) return;
      onChangeRef.current({ lat: event.lngLat.lat, lng: event.lngLat.lng });
    };
    marker.on('dragend', handleDragEnd);
    map.on('click', handleClick);
    return () => {
      marker.off('dragend', handleDragEnd);
      map.off('click', handleClick);
    };
  }, [map, marker]);

  // Follows the value, whether it came from the map or from the coordinates typed beside
  // it — and brings a typed pin into view if it landed off screen.
  useEffect(() => {
    if (!map) return;
    if (!value) {
      marker.remove();
      return;
    }
    marker.setLngLat([value.lng, value.lat]).addTo(map);
    if (!map.getBounds().contains([value.lng, value.lat])) {
      map.easeTo({ center: [value.lng, value.lat], zoom: Math.max(map.getZoom(), PIN_ZOOM), duration: 500 });
    }
  }, [map, marker, value]);

  return (
    <div className="ops-map border-border/70 relative h-72 w-full overflow-hidden rounded-xl border sm:h-80">
      {/* Positioned inline, not with `absolute inset-0`: MapLibre's stylesheet sets
          `position: relative` on this element in an unlayered rule, which beats any utility
          class, and a relatively positioned container here collapses to zero height — the
          map loads and draws into nothing. Same fix as components/dispatch/dispatch-map.tsx. */}
      <div
        ref={containerRef}
        style={{ position: 'absolute', inset: 0 }}
        role="application"
        aria-label={t('catalogue.form.mapLabel')}
      />
      {status === 'loading' && (
        <div className="text-caption text-muted pointer-events-none absolute inset-x-0 top-3 text-center">
          {t('dispatch.map.loading')}
        </div>
      )}
      {status === 'error' && (
        <div className="bg-surface/90 absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
          <p className="text-body font-bold">{t('dispatch.map.errorTitle')}</p>
          <p className="text-caption text-muted">{t('catalogue.form.mapErrorBody')}</p>
          <Button
            variant="secondary"
            size="sm"
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
  );
}
