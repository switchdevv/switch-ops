'use client';

import { useState, type ReactNode } from 'react';
import { useMediaQuery } from '@/hooks/use-media-query';
import { useI18n } from '@/lib/i18n/provider';
import {
  DRIVER_COLOR_VAR,
  DRIVER_STATE_LABEL_KEY,
  DRIVER_STATES,
  ORDER_PHASES,
  PHASE_COLOR_VAR,
  PHASE_LABEL_KEY,
  type DispatchCounts,
  type RouteKind,
} from '@/lib/ops/dispatch';
import { ChevronDownIcon, FrameIcon, LayersIcon, MinusIcon, PlusIcon } from '@/components/icons';

/** Which families of pin are drawn. Anything the current selection touches is drawn
 * regardless — see DispatchMap — so hiding a layer can never hide the thing being
 * looked at. */
export type MapLayers = {
  customers: boolean;
  restaurants: boolean;
  drivers: boolean;
  region: boolean;
};

export const DEFAULT_MAP_LAYERS: MapLayers = {
  customers: true,
  restaurants: true,
  drivers: true,
  region: true,
};

export function MapControls({
  onZoomIn,
  onZoomOut,
  onFitAll,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitAll: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="absolute end-3 top-3 z-20 flex flex-col gap-2">
      <div className="border-border/70 bg-surface/95 shadow-card flex flex-col overflow-hidden rounded-xl border backdrop-blur">
        <ControlButton label={t('dispatch.map.zoomIn')} onClick={onZoomIn}>
          <PlusIcon className="size-4" />
        </ControlButton>
        <span aria-hidden className="bg-separator h-px" />
        <ControlButton label={t('dispatch.map.zoomOut')} onClick={onZoomOut}>
          <MinusIcon className="size-4" />
        </ControlButton>
      </div>

      <div className="border-border/70 bg-surface/95 shadow-card flex flex-col overflow-hidden rounded-xl border backdrop-blur">
        <ControlButton label={t('dispatch.map.fitAll')} onClick={onFitAll}>
          <FrameIcon className="size-4" />
        </ControlButton>
      </div>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="text-muted hover:bg-surface-secondary hover:text-foreground focus-visible:ring-focus grid size-9 place-items-center transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
    >
      {children}
    </button>
  );
}

/**
 * The legend, which is also the layer switch.
 *
 * Two controls in one because they answer the same question from opposite ends: "what is
 * that red pin?" and "show me only the red pins". Keeping them apart would mean two
 * floating cards over a map that has no room for either, and a key nobody can act on.
 *
 * Collapsed by default on a phone, where it would otherwise cover the map it explains.
 */
export function MapLegend({
  layers,
  onChange,
  counts,
}: {
  layers: MapLayers;
  onChange: (layers: MapLayers) => void;
  counts: DispatchCounts;
}) {
  const { t, format } = useI18n();
  const isWide = useMediaQuery('(min-width: 1024px)');
  const [isOpen, setIsOpen] = useState(isWide);

  return (
    <div className="absolute start-3 top-3 z-20 w-[15.5rem] max-w-[calc(100%-1.5rem)]">
      <div className="border-border/70 bg-surface/95 shadow-card overflow-hidden rounded-xl border backdrop-blur">
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          className="hover:bg-surface-secondary/70 focus-visible:ring-focus flex w-full items-center gap-2 px-3 py-2 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset"
        >
          <LayersIcon aria-hidden className="text-muted size-4 shrink-0" />
          <span className="text-micro text-muted flex-1 text-start font-bold tracking-[0.14em] uppercase">
            {t('dispatch.map.legend')}
          </span>
          <ChevronDownIcon
            aria-hidden
            className={'text-faint size-4 shrink-0 transition-transform ' + (isOpen ? '' : 'rotate-180')}
          />
          <span className="sr-only">
            {t(isOpen ? 'dispatch.map.hideLegend' : 'dispatch.map.showLegend')}
          </span>
        </button>

        {isOpen && (
          <div className="border-separator/70 flex flex-col gap-3 border-t px-3 pt-2.5 pb-3">
            {/* The order colours are listed once, above both toggles, because they paint
                both kinds of order pin: the customer's teardrop and the ring around the
                restaurant it came from. (A pickup has no customer pin — the customer
                collects it — so its grey only ever appears on a restaurant.) */}
            <Group heading={t('dispatch.tabs.orders')}>
              <ul className="flex flex-col gap-1">
                {ORDER_PHASES.map((phase) => (
                  <SwatchRow
                    key={phase}
                    color={PHASE_COLOR_VAR[phase]}
                    label={t(PHASE_LABEL_KEY[phase])}
                    value={format.number(counts[phase])}
                  />
                ))}
              </ul>
              <LayerToggle
                label={t('dispatch.map.customers')}
                isOn={layers.customers}
                onChange={(customers) => onChange({ ...layers, customers })}
              />
              <LayerToggle
                label={t('dispatch.map.restaurants')}
                isOn={layers.restaurants}
                onChange={(restaurants) => onChange({ ...layers, restaurants })}
              />
            </Group>

            <Group heading={t('dispatch.tabs.drivers')}>
              <ul className="flex flex-col gap-1">
                {DRIVER_STATES.map((state) => (
                  <SwatchRow
                    key={state}
                    color={DRIVER_COLOR_VAR[state]}
                    label={t(DRIVER_STATE_LABEL_KEY[state])}
                    value={format.number(counts[state])}
                    isHollow={state === 'signalLost'}
                  />
                ))}
              </ul>
              <LayerToggle
                label={t('dispatch.map.drivers')}
                isOn={layers.drivers}
                onChange={(drivers) => onChange({ ...layers, drivers })}
              />
            </Group>

            <Group heading={t('dispatch.map.lines')}>
              <LineRow kind="trip" label={t('dispatch.map.trip')} />
              <LineRow kind="approach" label={t('dispatch.map.approach')} />
              <LineRow kind="queued" label={t('dispatch.map.queued')} />
              <LineRow kind="candidate" label={t('dispatch.map.candidate')} />
              <p className="text-micro text-faint">{t('dispatch.map.straight')}</p>
              <LayerToggle
                label={t('dispatch.map.region')}
                isOn={layers.region}
                onChange={(region) => onChange({ ...layers, region })}
              />
            </Group>
          </div>
        )}
      </div>
    </div>
  );
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5">
      <h3 className="text-micro text-muted font-bold tracking-[0.14em] uppercase">{heading}</h3>
      {children}
    </section>
  );
}

function LayerToggle({
  label,
  isOn,
  onChange,
}: {
  label: string;
  isOn: boolean;
  onChange: (isOn: boolean) => void;
}) {
  return (
    <label className="text-body flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={isOn}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-accent size-3.5"
      />
      <span className="font-bold">{label}</span>
    </label>
  );
}

function SwatchRow({
  color,
  label,
  value,
  isHollow,
}: {
  color: string;
  label: string;
  value: string;
  /** Drawn as an outline — the driver whose position is a last known one. */
  isHollow?: boolean;
}) {
  return (
    <li className="text-caption text-muted flex items-center gap-2">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={
          isHollow
            ? { border: `1.5px dashed ${color}` }
            : { backgroundColor: color }
        }
      />
      <span className="flex-1 truncate">{label}</span>
      <span className="tabular text-foreground font-bold">{value}</span>
    </li>
  );
}

/** The same dash each kind of line is drawn with on the map (ROUTE_LAYERS in
 * lib/map/basemap.ts), at legend size. */
const LINE_DASH: Record<RouteKind, string | undefined> = {
  trip: undefined,
  approach: '5 4',
  queued: '9 4',
  candidate: '0.1 5',
};

const LINE_STROKE: Record<RouteKind, string> = {
  trip: 'var(--accent)',
  approach: 'var(--accent)',
  queued: 'var(--queued)',
  candidate: 'var(--success)',
};

function LineRow({ kind, label }: { kind: RouteKind; label: string }) {
  const stroke = LINE_STROKE[kind];

  return (
    <span className="text-caption text-muted flex items-center gap-2">
      <svg aria-hidden viewBox="0 0 24 6" className="h-1.5 w-6 shrink-0">
        <line
          x1="1"
          y1="3"
          x2="23"
          y2="3"
          style={{ stroke }}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={LINE_DASH[kind]}
        />
      </svg>
      <span className="flex-1">{label}</span>
    </span>
  );
}
