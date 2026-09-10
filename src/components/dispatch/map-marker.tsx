'use client';

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Marker, type Map as MapLibreMap, type PositionAnchor } from 'maplibre-gl';
import type { LatLng } from '@/lib/ops/dispatch';

/**
 * One pin: a DOM element MapLibre positions, rendered into by React through a portal.
 *
 * The alternative — drawing pins as symbol layers inside the map's canvas — would mean
 * generating an image per state and colour, and losing hover, focus and the app's own
 * type and tokens. Through a portal a pin is an ordinary component: it reads the theme's
 * CSS variables, it is a real `<button>` for the keyboard, and the RN apps' rasterise-
 * once marker problem (see the maps notes in switch-driver) cannot arise.
 *
 * The element outlives every re-render, so hover state and CSS transitions survive the
 * fifteen-second refresh that moves the driver underneath them.
 */
export function MapMarker({
  map,
  position,
  anchor = 'center',
  zIndex = 0,
  children,
}: {
  map: MapLibreMap;
  position: LatLng;
  anchor?: PositionAnchor;
  /** Stacking within the map: what a dispatcher must see when pins overlap. */
  zIndex?: number;
  children: ReactNode;
}) {
  const [marker] = useState(() => {
    const element = document.createElement('div');
    // MapLibre gives every marker wrapper `role="button"` and an "Map marker" label
    // unless it already has them. The pin inside is the real button, with the real
    // label, so the wrapper is pre-set to announce nothing instead of shadowing it.
    element.setAttribute('role', 'presentation');
    element.setAttribute('aria-label', '');
    return new Marker({ element, anchor }).setLngLat([position.lng, position.lat]);
  });

  useEffect(() => {
    marker.addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, marker]);

  useEffect(() => {
    marker.setLngLat([position.lng, position.lat]);
  }, [marker, position.lat, position.lng]);

  useEffect(() => {
    marker.getElement().style.zIndex = String(zIndex);
  }, [marker, zIndex]);

  return createPortal(children, marker.getElement());
}

/** Farther than this between pressing and releasing and it was a pan, not a click. */
const DRAG_TOLERANCE_PX = 4;

/**
 * Click handling for something sitting on a map.
 *
 * A marker is inside the map's own drag surface, so a dispatcher who grabs the map to
 * pan it and happens to start on a pin would otherwise "click" that pin when they let
 * go — selecting an order they were only moving past. Pointer movement between press and
 * release is what tells the two apart.
 */
export function useMapClick(onClick: () => void) {
  const origin = useRef<{ x: number; y: number } | null>(null);

  return {
    onPointerDown: (event: PointerEvent) => {
      origin.current = { x: event.clientX, y: event.clientY };
    },
    onClick: (event: { clientX: number; clientY: number }) => {
      const from = origin.current;
      origin.current = null;
      if (from && Math.hypot(event.clientX - from.x, event.clientY - from.y) > DRAG_TOLERANCE_PX) {
        return;
      }
      onClick();
    },
  };
}
