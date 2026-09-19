'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

/**
 * One clock for the whole page, ticking on an interval.
 *
 * Every "8 min ago" on the board reads from this rather than calling `Date.now()`
 * itself. Two reasons: forty rows computing their own `now` can round to different
 * minutes for orders placed a second apart, and a value read during render changes on
 * every unrelated re-render, so ages would silently shift whenever anything else on
 * the page moved.
 *
 * Reading the clock in the initialiser is safe here only because nothing under
 * `I18nProvider` renders on the server — it withholds its children until the language
 * resolves in an effect (see lib/i18n/provider.tsx), so this hook's first render is
 * already a browser render and cannot mismatch a prerender.
 */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

/* ---- one shared one-second clock ------------------------------------------------- */

const secondListeners = new Set<() => void>();
let secondNow = Date.now();
let secondTimer: ReturnType<typeof setInterval> | undefined;

function subscribeSecond(listener: () => void) {
  secondListeners.add(listener);
  if (secondTimer === undefined) {
    secondNow = Date.now();
    secondTimer = setInterval(() => {
      secondNow = Date.now();
      for (const notify of secondListeners) notify();
    }, 1000);
    // The snapshot may have been read while no clock was running; bring it up to date.
    listener();
  }
  return () => {
    secondListeners.delete(listener);
    if (secondListeners.size === 0 && secondTimer !== undefined) {
      clearInterval(secondTimer);
      secondTimer = undefined;
    }
  };
}

/**
 * A once-a-second clock for countdowns ("going out in 3 s"), shared by every component that
 * reads it: one timer and one render pass per second, however many rows are counting —
 * where `useNow(1000)` per row meant one interval, and one render, per queued order.
 */
export function useSecondClock(): number {
  return useSyncExternalStore(
    subscribeSecond,
    () => secondNow,
    () => secondNow,
  );
}
