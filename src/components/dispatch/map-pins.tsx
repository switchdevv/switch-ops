'use client';

import type { ReactNode } from 'react';
import {
  DRIVER_COLOR_VAR,
  DRIVER_ON_COLOR_VAR,
  PHASE_COLOR_VAR,
  PHASE_ON_COLOR_VAR,
  type DriverState,
  type OrderPhase,
} from '@/lib/ops/dispatch';
import { BikeIcon, HomeIcon, SignalOffIcon, StoreIcon } from '@/components/icons';
import { useMapClick } from './map-marker';

/**
 * The three things on the map, drawn so they can be told apart with the colour ignored:
 * a customer is a teardrop, a restaurant a plaque, a driver a disc. Colour then carries
 * the state — which is the second question, once you know what you are looking at.
 *
 * Everything here is DOM inside a marker (see MapMarker), so the pins use the same
 * palette tokens as the panel beside them and follow the theme without a redraw. The
 * surface colour outlines every pin: white on the light basemap, near-black on the dark
 * one, which is what keeps a pin readable over a motorway or a park in both.
 */

type PinShellProps = {
  /** Announced to a screen reader — the whole pin in one sentence. */
  ariaLabel: string;
  /** The bubble on hover: the same fact, for the eye. */
  label: string;
  isSelected: boolean;
  /** Something else is selected and this isn't part of it. */
  isDimmed: boolean;
  /** Pointed at, here or in the list beside the map. */
  isHighlighted: boolean;
  onSelect: () => void;
  onHoverChange: (isHovered: boolean) => void;
  children: ReactNode;
};

function PinShell({
  ariaLabel,
  label,
  isSelected,
  isDimmed,
  isHighlighted,
  onSelect,
  onHoverChange,
  children,
}: PinShellProps) {
  const click = useMapClick(onSelect);

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={isSelected}
      onPointerDown={click.onPointerDown}
      onClick={click.onClick}
      onPointerEnter={() => onHoverChange(true)}
      onPointerLeave={() => onHoverChange(false)}
      onFocus={() => onHoverChange(true)}
      onBlur={() => onHoverChange(false)}
      className={
        'group ops-pin relative block cursor-pointer appearance-none border-0 bg-transparent p-0 leading-none transition duration-200 outline-none ' +
        (isDimmed ? 'opacity-35 ' : '') +
        (isSelected ? 'scale-110 ' : '')
      }
    >
      {children}

      {/* `font-sans` on purpose: MapLibre sets Helvetica on its own container, and the
          bubble is rendered inside it. */}
      <span
        aria-hidden
        className={
          'bg-foreground text-background text-caption shadow-raised pointer-events-none absolute bottom-[calc(100%+7px)] left-1/2 -translate-x-1/2 rounded-lg px-2 py-1 font-sans font-bold whitespace-nowrap transition-opacity duration-150 ' +
          (isHighlighted || isSelected
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100')
        }
      >
        {label}
      </span>
    </button>
  );
}

/**
 * The ring a selected pin sits in, so the selection survives the pin being small.
 *
 * `centerY` is the pin's own head, not the middle of its box: a teardrop is mostly tail,
 * and a halo centred on the box would sit low enough to look like it belongs to whatever
 * is underneath.
 */
function SelectionRing({ isSelected, centerY }: { isSelected: boolean; centerY?: number }) {
  if (!isSelected) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-1/2 size-11 -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{
        top: centerY ?? '50%',
        boxShadow: '0 0 0 2px var(--surface), 0 0 0 4px var(--accent)',
      }}
    />
  );
}

/**
 * Where a delivery is going.
 *
 * The one that pulses is the one nobody is carrying: on a screen a dispatcher watches
 * out of the corner of an eye, a red dot among red dots is easy to miss and a moving one
 * is not. It is the same heartbeat the Live indicator uses, and it stops entirely under
 * `prefers-reduced-motion` (see globals.css).
 */
export function CustomerPin({
  phase,
  label,
  ariaLabel,
  isSelected,
  isDimmed,
  isHighlighted,
  onSelect,
  onHoverChange,
}: Omit<PinShellProps, 'children'> & { phase: OrderPhase }) {
  const color = PHASE_COLOR_VAR[phase];

  return (
    <PinShell
      ariaLabel={ariaLabel}
      label={label}
      isSelected={isSelected}
      isDimmed={isDimmed}
      isHighlighted={isHighlighted}
      onSelect={onSelect}
      onHoverChange={onHoverChange}
    >
      <span className="relative block h-[34px] w-[26px]">
        <SelectionRing isSelected={isSelected} centerY={13} />
        {phase === 'needsDriver' && (
          <span
            aria-hidden
            className="ops-ping absolute top-[13px] left-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ backgroundColor: color }}
          />
        )}
        <svg
          aria-hidden
          viewBox="0 0 26 34"
          className="relative block h-[34px] w-[26px]"
          style={{ filter: 'drop-shadow(0 2px 3px rgb(0 0 0 / 0.28))' }}
        >
          <path
            d="M13 32.8S23.5 22 23.5 13.2a10.5 10.5 0 1 0-21 0C2.5 22 13 32.8 13 32.8Z"
            style={{ fill: color, stroke: 'var(--surface)' }}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx="13" cy="12.8" r="5.6" style={{ fill: 'var(--surface)' }} />
        </svg>
        <HomeIcon
          aria-hidden
          className="absolute top-[12.8px] left-1/2 size-[13px] -translate-x-1/2 -translate-y-1/2"
          style={{ color }}
        />
      </span>
    </PinShell>
  );
}

/**
 * Where the food is. Square-ish and pale rather than another teardrop: a restaurant is a
 * fixed place a dispatcher navigates *by*, not a job to be done, so it reads as part of
 * the map's furniture — until one of its orders turns its edge red.
 */
export function RestaurantPin({
  phase,
  count,
  label,
  ariaLabel,
  isSelected,
  isDimmed,
  isHighlighted,
  rank,
  onSelect,
  onHoverChange,
}: Omit<PinShellProps, 'children'> & { phase: OrderPhase; count: number; rank?: number }) {
  const color = PHASE_COLOR_VAR[phase];

  return (
    <PinShell
      ariaLabel={ariaLabel}
      label={label}
      isSelected={isSelected}
      isDimmed={isDimmed}
      isHighlighted={isHighlighted}
      onSelect={onSelect}
      onHoverChange={onHoverChange}
    >
      <span className="relative block h-[38px] w-[34px]">
        <SelectionRing isSelected={isSelected} centerY={16} />
        {/* The tail, drawn as a rotated square whose two outer edges carry the border. */}
        <span
          aria-hidden
          className="bg-surface absolute top-[25px] left-1/2 size-[11px] -translate-x-1/2 rotate-45 rounded-[2px] border-r-2 border-b-2"
          style={{ borderColor: color }}
        />
        <span
          className="bg-surface absolute top-0 left-1/2 grid size-8 -translate-x-1/2 place-items-center rounded-xl border-2"
          style={{ borderColor: color, boxShadow: '0 2px 4px rgb(0 0 0 / 0.24)' }}
        >
          <StoreIcon aria-hidden className="text-foreground size-4" />
        </span>
        {count > 1 && (
          <span
            aria-hidden
            className="text-micro absolute -top-1.5 right-0 grid h-[17px] min-w-[17px] place-items-center rounded-full px-1 font-sans font-bold"
            style={{
              backgroundColor: color,
              color: PHASE_ON_COLOR_VAR[phase],
              boxShadow: '0 0 0 2px var(--surface)',
            }}
          >
            {count}
          </span>
        )}
        {rank !== undefined && <RankBadge rank={rank} />}
      </span>
    </PinShell>
  );
}

/**
 * A driver. Filled with their state, because that is the whole question being asked of
 * them: green is someone who can be sent now, blue is someone already carrying, and a
 * dashed grey outline is a driver whose app has gone quiet — a pin showing where they
 * *were*, which is why it is drawn as an absence rather than a colour.
 */
export function DriverPin({
  state,
  rank,
  label,
  ariaLabel,
  isSelected,
  isDimmed,
  isHighlighted,
  onSelect,
  onHoverChange,
}: Omit<PinShellProps, 'children'> & { state: DriverState; rank?: number }) {
  const isLost = state === 'signalLost';

  return (
    <PinShell
      ariaLabel={ariaLabel}
      label={label}
      isSelected={isSelected}
      isDimmed={isDimmed}
      isHighlighted={isHighlighted}
      onSelect={onSelect}
      onHoverChange={onHoverChange}
    >
      <span className="relative block size-[30px]">
        <SelectionRing isSelected={isSelected} />
        <span
          className={
            'grid size-[30px] place-items-center rounded-full ' +
            (isLost ? 'border-2 border-dashed' : 'border-2')
          }
          style={{
            backgroundColor: isLost ? 'var(--surface)' : DRIVER_COLOR_VAR[state],
            borderColor: isLost ? 'var(--faint)' : 'var(--surface)',
            boxShadow: '0 2px 4px rgb(0 0 0 / 0.24)',
          }}
        >
          {isLost ? (
            <SignalOffIcon aria-hidden className="text-faint size-4" />
          ) : (
            <BikeIcon aria-hidden className="size-4" style={{ color: DRIVER_ON_COLOR_VAR[state] }} />
          )}
        </span>
        {rank !== undefined && <RankBadge rank={rank} />}
      </span>
    </PinShell>
  );
}

/** 1, 2, 3 — how near this one is to the thing selected. Ink-coloured rather than another
 * status hue: the rank is about the selection, not about the driver's own state. */
function RankBadge({ rank }: { rank: number }) {
  return (
    <span
      aria-hidden
      className="bg-foreground text-background absolute -top-1.5 -right-1.5 grid size-[17px] place-items-center rounded-full font-sans text-[10px] font-bold"
      style={{ boxShadow: '0 0 0 2px var(--surface)' }}
    >
      {rank}
    </span>
  );
}
