'use client';

import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { useI18n } from '@/lib/i18n/provider';
import { ChevronDownIcon } from '@/components/icons';

/**
 * The panel on a phone: a sheet over the foot of the map that stops at three heights.
 *
 * - **peek** — only the three numbers, and the map gets the screen. What "is anything
 *   waiting?" needs, and no more.
 * - **half** — the list or the selected order over the lower half, with the map above
 *   still framing what is selected. Where the work happens, so it is where the sheet
 *   opens.
 * - **full** — the list, as tall as the page allows, for reading down a long evening.
 *
 * The grab bar is dragged, or tapped to step up through the stops and back down to the
 * map. Only the bar drags: everything under it is a button or a scrolling list, and
 * guessing which of those a finger meant is how a tap on an order becomes a sheet
 * lurching shut.
 */

export type SheetSnap = 'peek' | 'half' | 'full';
export type SheetHeights = Record<SheetSnap, number>;

const SNAPS: SheetSnap[] = ['peek', 'half', 'full'];

/** The grab bar (`h-7`), above the panel's first row. */
const GRAB_PX = 28;
/** Below the numbers a peeking sheet shows, so they don't sit on the screen's edge. */
const PEEK_GAP_PX = 12;
/** How much of the page a half-open sheet covers — a little over half, since the lower
 * half is where the reading is. */
const HALF_RATIO = 0.55;
/** Map left showing above a fully open sheet — enough to read as a sheet over the map
 * rather than a page that replaced it. */
const FULL_GAP_PX = 8;
/** Movement before a press on the bar counts as a drag rather than a tap. */
const DRAG_SLOP_PX = 6;
/** How far ahead a release is projected, so a flick carries on the way it was going. */
const FLING_MS = 180;
/** A release this long after the finger last moved was a stop, not a flick. */
const FLING_STALE_MS = 90;

/** Before the page has been measured — the same stops, near enough, in CSS. */
const FALLBACK_HEIGHT: Record<SheetSnap, string> = {
  peek: '6rem',
  half: `${HALF_RATIO * 100}%`,
  full: `calc(100% - ${FULL_GAP_PX}px)`,
};

/** The three stops for a page `container` tall, whose panel summary is `summary` tall. */
export function sheetHeights(container: number, summary: number): SheetHeights {
  const full = Math.max(0, container - FULL_GAP_PX);
  const peek = Math.min(full, GRAB_PX + summary + PEEK_GAP_PX);
  const half = Math.min(full, Math.max(peek, Math.round(container * HALF_RATIO)));
  return { peek, half, full };
}

type Gesture = {
  pointerId: number;
  startY: number;
  startHeight: number;
  lastY: number;
  lastTime: number;
  /** Pixels per millisecond, upwards positive. */
  velocity: number;
  isDragging: boolean;
};

export function DispatchSheet({
  snap,
  heights,
  onSnapChange,
  children,
}: {
  snap: SheetSnap;
  /** `null` until the page has been measured. */
  heights: SheetHeights | null;
  onSnapChange: (snap: SheetSnap) => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const sheetRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const swallowClickRef = useRef(false);
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  const index = SNAPS.indexOf(snap);

  const settle = (height: number, velocity: number) => {
    if (!heights) return;
    const target = height + velocity * FLING_MS;
    const nearest = SNAPS.reduce((best, stop) =>
      Math.abs(heights[stop] - target) < Math.abs(heights[best] - target) ? stop : best,
    );
    setDragHeight(null);
    onSnapChange(nearest);
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    swallowClickRef.current = false;
    const sheet = sheetRef.current;
    if (!heights || !sheet || !event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    gestureRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      // Where the sheet is, which halfway through settling is not where it is going.
      startHeight: sheet.getBoundingClientRect().height,
      lastY: event.clientY,
      lastTime: event.timeStamp,
      velocity: 0,
      isDragging: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || !heights) return;
    if (!gesture.isDragging) {
      if (Math.abs(gesture.startY - event.clientY) < DRAG_SLOP_PX) return;
      // Follow the finger from here, so crossing the slop doesn't jolt the sheet by it.
      gesture.isDragging = true;
      gesture.startY = event.clientY;
      gesture.lastY = event.clientY;
      gesture.lastTime = event.timeStamp;
      return;
    }

    const travel = gesture.startY - event.clientY;
    const elapsed = event.timeStamp - gesture.lastTime;
    if (elapsed > 0) gesture.velocity = (gesture.lastY - event.clientY) / elapsed;
    gesture.lastY = event.clientY;
    gesture.lastTime = event.timeStamp;

    setDragHeight(clamp(gesture.startHeight + travel, heights.peek, heights.full));
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (!gesture.isDragging || !heights) return;
    // The click the browser sends after this release ends the drag; it isn't a tap.
    swallowClickRef.current = true;
    const height = clamp(gesture.startHeight + gesture.startY - event.clientY, heights.peek, heights.full);
    const isFlick = event.timeStamp - gesture.lastTime <= FLING_STALE_MS;
    settle(height, isFlick ? gesture.velocity : 0);
  };

  /** The browser took the pointer back (a system gesture, a scroll it decided to own):
   * stop where the finger last was, without the flick. */
  const onPointerCancel = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gestureRef.current = null;
    if (!gesture.isDragging || !heights) return;
    settle(clamp(gesture.startHeight + gesture.startY - gesture.lastY, heights.peek, heights.full), 0);
  };

  const onClick = () => {
    if (swallowClickRef.current) {
      swallowClickRef.current = false;
      return;
    }
    onSnapChange(SNAPS[(index + 1) % SNAPS.length]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const step = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    onSnapChange(SNAPS[clamp(index + step, 0, SNAPS.length - 1)]);
  };

  const height = dragHeight ?? heights?.[snap] ?? FALLBACK_HEIGHT[snap];

  return (
    <div
      ref={sheetRef}
      // `overflow-clip`, not `hidden`: a hidden overflow is still a scroll container, and a
      // focused field or a scrollIntoView further down would scroll the whole sheet — grab
      // bar and all — up out of its own frame.
      className={
        'border-border/70 bg-surface shadow-raised absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-clip rounded-t-2xl border-t ' +
        (dragHeight === null ? 'transition-[height] duration-200 ease-out motion-reduce:transition-none' : '')
      }
      style={{ height }}
    >
      <button
        type="button"
        aria-label={t(snap === 'full' ? 'dispatch.sheet.collapse' : 'dispatch.sheet.expand')}
        aria-expanded={snap !== 'peek'}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={onClick}
        onKeyDown={onKeyDown}
        className="focus-visible:ring-focus relative flex h-7 w-full shrink-0 cursor-grab touch-none items-center justify-center outline-none select-none focus-visible:ring-2 focus-visible:ring-inset active:cursor-grabbing"
      >
        <span aria-hidden className="bg-muted/35 h-1.5 w-10 rounded-full" />
        {/* Said only once the map is out of sight: below that the map is right there, and
            from here nothing else on screen says a tap on this bar is the way back to it. */}
        {snap === 'full' && (
          <span aria-hidden className="text-micro text-muted absolute end-3 flex items-center gap-1 font-bold">
            {t('dispatch.sheet.toMap')}
            <ChevronDownIcon className="size-3.5" />
          </span>
        )}
      </button>

      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
