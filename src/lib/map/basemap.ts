import {
  getRTLTextPluginStatus,
  setRTLTextPlugin,
  type ExpressionSpecification,
  type GeoJSONSource,
  type LayerSpecification,
  type Map as MapLibreMap,
  type StyleSpecification,
} from 'maplibre-gl';
import type { Locale } from '@/lib/i18n/locales';
import type { LatLng, OrderPhase, RouteLeg } from '@/lib/ops/dispatch';

/**
 * Everything the live map knows about its base layer, in one place.
 *
 * Imports MapLibre at runtime, so only the map components (each loaded client-side only —
 * see components/dispatch/dispatch-screen.tsx and components/restaurants/restaurant-form.tsx)
 * may import this module.
 */

export type MapTheme = 'light' | 'dark';

/**
 * OpenFreeMap's hosted styles: OpenStreetMap vector tiles with no API key, no account
 * and no request quota, free for commercial use.
 *
 * Positron and Dark, specifically, because they are the quiet ones — greys, no coloured
 * land use, small labels — and on a map whose information is the pins, the base layer's
 * job is to recede. Moving to a paid provider (MapTiler, Stadia, a self-hosted
 * planetiler) is a matter of swapping these two URLs: nothing else in the app knows
 * where tiles come from.
 */
const STYLE_URL: Record<MapTheme, string> = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

/** How long the basemap style may take before the map shows its error card. */
const BASEMAP_TIMEOUT_MS = 8_000;

const styleRequests = new Map<MapTheme, Promise<StyleSpecification>>();

/** The raw style JSON, fetched once per theme per page load. Theme switches are instant
 * after the first, and a style that failed to arrive is forgotten so a retry really does
 * ask again. */
function fetchStyle(theme: MapTheme): Promise<StyleSpecification> {
  const pending = styleRequests.get(theme);
  if (pending) return pending;

  // A deadline, like every Parse request (lib/parse/deadline.ts): a tile CDN that never
  // answers would otherwise hold the map on "Loading" with no Retry, since only a failure
  // reaches the error card.
  const request = fetch(STYLE_URL[theme], { signal: AbortSignal.timeout(BASEMAP_TIMEOUT_MS) }).then(async (response) => {
    if (!response.ok) throw new Error(`Basemap style "${theme}" answered HTTP ${response.status}`);
    return (await response.json()) as StyleSpecification;
  });
  styleRequests.set(theme, request);
  request.catch(() => styleRequests.delete(theme));
  return request;
}

/** The base style for a theme, with its labels in the console's language. */
export async function loadBasemapStyle(theme: MapTheme, locale: Locale): Promise<StyleSpecification> {
  return localizeLabels(await fetchStyle(theme), locale);
}

/**
 * Place and street names in the console's language, one line each.
 *
 * The stock styles print every label twice — its Latin form over its non-Latin one —
 * which in Algeria means most streets carry two names in two scripts, at twice the
 * clutter under the pins. French is the Latin name that is actually posted on Algerian
 * street signs and tagged in OpenStreetMap (`name:fr`), so it comes first in both
 * languages; the English UI tries `name:en` before it for the handful of places that
 * have one. `name` — often Arabic — is the fallback where neither exists, and is shaped
 * by the plugin below.
 */
function labelField(locale: Locale): ExpressionSpecification {
  return locale === 'fr'
    ? ['coalesce', ['get', 'name:fr'], ['get', 'name']]
    : ['coalesce', ['get', 'name:en'], ['get', 'name:fr'], ['get', 'name']];
}

function localizeLabels(style: StyleSpecification, locale: Locale): StyleSpecification {
  const field = labelField(locale);
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (layer.type !== 'symbol') return layer;
      const current = layer.layout?.['text-field'];
      // Only labels that print a name. Road shields print a `ref` ("N11"), and
      // replacing those would turn every motorway number into a street name.
      if (current === undefined || !JSON.stringify(current).includes('name')) return layer;
      return { ...layer, layout: { ...layer.layout, 'text-field': field } };
    }),
  };
}

let rtlRequested = false;

/**
 * Arabic shaping, for the labels that only exist in Arabic.
 *
 * MapLibre 5 draws right-to-left scripts unjoined and in the wrong order unless Mapbox's
 * RTL plugin is loaded (MapLibre 6 shapes them itself, but ships its worker as a separate
 * file this static export can't serve without extra build steps). `lazy`, so it is only
 * fetched the first time a tile really holds right-to-left text — with the labels above
 * preferring French, the streets OpenStreetMap names in Arabic alone.
 *
 * From jsDelivr at a pinned version: MapLibre loads the plugin into its worker by URL,
 * so it can't come out of this bundle. If the CDN is unreachable, those few labels
 * render unshaped and nothing else is affected.
 */
export function ensureRtlText(): void {
  if (rtlRequested) return;
  rtlRequested = true;
  if (getRTLTextPluginStatus() !== 'unavailable') return;
  setRTLTextPlugin(
    'https://cdn.jsdelivr.net/npm/@mapbox/mapbox-gl-rtl-text@0.3.0/dist/mapbox-gl-rtl-text.js',
    true,
  ).catch(() => {});
}

/* ---- the console's own layers ------------------------------------------------ */

/**
 * The palette tokens the map's GL layers draw with, as hex.
 *
 * Literal because WebGL can't read CSS custom properties and MapLibre's colour parser
 * doesn't take `oklch()`. Each value is the exact sRGB conversion of the matching token in
 * app/globals.css, so a line and the pin it ends on are the same colour. Pins are DOM
 * elements and use the tokens themselves.
 */
export type MapPalette = {
  accent: string;
  success: string;
  warning: string;
  danger: string;
  faint: string;
  /** An order lined up behind a busy driver, and the way their queue runs. */
  queued: string;
  /** The halo under a line — the surface colour, so a route reads over any street. */
  casing: string;
};

export const MAP_PALETTE: Record<MapTheme, MapPalette> = {
  light: {
    accent: '#2F6FED',
    success: '#18A349',
    warning: '#F59E0A',
    danger: '#DC2627',
    faint: '#8A8F98',
    queued: '#7C3AED',
    casing: '#FFFFFF',
  },
  dark: {
    accent: '#5A8DEF',
    success: '#1EC55F',
    warning: '#FCBF26',
    danger: '#F87172',
    faint: '#848A90',
    queued: '#A78BFA',
    casing: '#26292B',
  },
};

/** The first thing drawn before the real style arrives: the page colour, so the map
 * area never flashes white in dark mode while tiles load. */
export function blankStyle(theme: MapTheme): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: { 'background-color': theme === 'dark' ? '#1B1D1F' : '#F4F5F7' },
      },
    ],
  };
}

const REGION_SOURCE = 'ops-region';
const ROUTE_SOURCE = 'ops-routes';

export type OverlayData = {
  region: GeoJSON.FeatureCollection;
  routes: GeoJSON.FeatureCollection;
};

const REGION_LAYERS: LayerSpecification[] = [
  {
    id: 'ops-region-fill',
    type: 'fill',
    source: REGION_SOURCE,
    paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.045 },
  },
  {
    id: 'ops-region-line',
    type: 'line',
    source: REGION_SOURCE,
    layout: { 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-opacity': 0.55,
      'line-width': 1.5,
      'line-dasharray': [3, 2],
    },
  },
];

/**
 * Four kinds of line, told apart by their dash before their colour — so they still
 * read for a colourblind dispatcher:
 *
 * - solid: the order's own trip, restaurant to customer, in the order's colour;
 * - dashed: a driver heading to their next stop;
 * - long-dashed: the way a driver's queue runs, from one drop-off to the next pickup;
 * - dotted: a free driver who could be sent to this restaurant.
 */
const ROUTE_LAYERS: LayerSpecification[] = [
  {
    id: 'ops-route-casing',
    type: 'line',
    source: ROUTE_SOURCE,
    filter: ['!=', ['get', 'kind'], 'candidate'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'casing'],
      'line-width': ['match', ['get', 'kind'], 'trip', 8, 6],
      'line-opacity': 0.85,
    },
  },
  {
    id: 'ops-route-trip',
    type: 'line',
    source: ROUTE_SOURCE,
    filter: ['==', ['get', 'kind'], 'trip'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 3.5 },
  },
  {
    id: 'ops-route-approach',
    type: 'line',
    source: ROUTE_SOURCE,
    filter: ['==', ['get', 'kind'], 'approach'],
    layout: { 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [2, 1.5] },
  },
  {
    id: 'ops-route-queued',
    type: 'line',
    source: ROUTE_SOURCE,
    filter: ['==', ['get', 'kind'], 'queued'],
    layout: { 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 3, 'line-dasharray': [4, 2] },
  },
  {
    id: 'ops-route-candidate',
    type: 'line',
    source: ROUTE_SOURCE,
    filter: ['==', ['get', 'kind'], 'candidate'],
    // A round cap on a near-zero dash is what turns a dashed line into dots.
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': 3,
      'line-opacity': 0.8,
      'line-dasharray': [0.01, 2],
    },
  },
];

/**
 * Adds the console's sources and layers to whatever style is loaded — called on every
 * `style.load`, because swapping the base style for the other theme discards everything
 * that isn't part of it. Idempotent, so calling it twice for one style costs nothing.
 *
 * The region sits under the base map's labels, so street names stay crisp on top of its
 * tint; the routes sit over everything, because they are the point.
 */
export function installOverlays(map: MapLibreMap, data: OverlayData): void {
  if (!map.getSource(REGION_SOURCE)) {
    map.addSource(REGION_SOURCE, { type: 'geojson', data: data.region });
  }
  if (!map.getSource(ROUTE_SOURCE)) {
    map.addSource(ROUTE_SOURCE, { type: 'geojson', data: data.routes });
  }

  const firstLabel = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id;
  for (const layer of REGION_LAYERS) {
    if (!map.getLayer(layer.id)) map.addLayer(layer, firstLabel);
  }
  for (const layer of ROUTE_LAYERS) {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
  }
}

/** Pushes new overlay data into a style that already has the sources. A style still
 * loading has none yet; `installOverlays` will seed it with the same data on arrival. */
export function updateOverlays(map: MapLibreMap, data: OverlayData): void {
  const region = map.getSource(REGION_SOURCE);
  if (region?.type === 'geojson') (region as GeoJSONSource).setData(data.region);
  const routes = map.getSource(ROUTE_SOURCE);
  if (routes?.type === 'geojson') (routes as GeoJSONSource).setData(data.routes);
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/** The region's outline as a closed GeoJSON ring — GeoJSON's order, [lng, lat]. */
export function regionFeatures(outline: LatLng[], palette: MapPalette): GeoJSON.FeatureCollection {
  if (outline.length < 3) return EMPTY;
  const ring = outline.map((point) => [point.lng, point.lat]);
  const [first] = ring;
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push(first);

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { color: palette.accent },
        geometry: { type: 'Polygon', coordinates: [ring] },
      },
    ],
  };
}

function tripColor(phase: OrderPhase | undefined, palette: MapPalette): string {
  switch (phase) {
    case 'needsDriver':
      return palette.danger;
    case 'awaitingRestaurant':
      return palette.warning;
    case 'queued':
      return palette.queued;
    case 'pickup':
      return palette.faint;
    default:
      return palette.accent;
  }
}

function legColor(leg: RouteLeg, palette: MapPalette): string {
  switch (leg.kind) {
    case 'candidate':
      return palette.success;
    case 'approach':
      return palette.accent;
    case 'queued':
      return palette.queued;
    default:
      return tripColor(leg.phase, palette);
  }
}

export function routeFeatures(legs: RouteLeg[], palette: MapPalette): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: legs.map((leg) => ({
      type: 'Feature',
      properties: {
        kind: leg.kind,
        color: legColor(leg, palette),
        casing: palette.casing,
      },
      geometry: {
        type: 'LineString',
        coordinates: [
          [leg.from.lng, leg.from.lat],
          [leg.to.lng, leg.to.lat],
        ],
      },
    })),
  };
}
