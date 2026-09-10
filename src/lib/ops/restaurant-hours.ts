import { BUSINESS_TIME_ZONE } from '@/lib/format';
import type { ClockTime, OrderRestaurant } from '@/types/order';

/**
 * Whether a restaurant is taking orders right now, and when that changes.
 *
 * Transcribed from the customer app's checkout (switch-food/src/screens/Cart/Checkout.js,
 * the check before an order is placed), because that is the rule that actually refuses
 * an order:
 *
 *   active  &&  today is a working day  &&  open <= now < close  &&  not inside the break
 *
 * Not from the restaurant list's label (switch-food/src/ui/ListItem/ListItem.js), which
 * shows "Open" for a row with no hours at all — checkout can't take an order from one.
 *
 * Evaluated on the Algiers wall clock, because that is the clock a customer's phone
 * checks it against; the dispatcher's browser may be set to anything.
 *
 * Hours never wrap past midnight on this platform: both apps compare `close` on the same
 * day as `open`, so a restaurant saved as 18:00–02:00 can't be ordered from at any hour.
 * It is reported as closed here too — what ops needs to know is what a customer can do.
 */

export type RestaurantHours =
  /** Taking orders until `closesAt`. */
  | { state: 'open'; closesAt: ClockTime }
  /** Inside its daily break, back at `resumesAt`. */
  | { state: 'break'; resumesAt: ClockTime }
  /** Switched off by hand (`active` is not on). During service this is usually a
   * kitchen that has fallen behind, and worth a call. */
  | { state: 'paused' }
  /** Outside today's hours. `opensAt` is set when it opens later today; `isDayOff` when
   * today is not one of its working days. */
  | { state: 'closed'; opensAt: ClockTime | null; isDayOff: boolean }
  /** No hours on file, so checkout can't take an order from it either. */
  | { state: 'unknown' };

export type RestaurantHoursFields = Pick<
  OrderRestaurant,
  'active' | 'openTime' | 'closeTime' | 'pauseStart' | 'pauseEnd' | 'workingDays'
>;

/** Weekday and time of day in Algiers. `hourCycle: 'h23'` rather than `hour12: false`,
 * which some engines render as "24:05" just after midnight. */
const WALL_CLOCK = new Intl.DateTimeFormat('en-GB', {
  timeZone: BUSINESS_TIME_ZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** en-GB's short weekday names, in JavaScript's `getDay()` order — the numbering the
 * `workingDays` column uses. */
const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** A moment as a restaurant's hours see it: which weekday, and how many minutes past
 * midnight, in Algiers. */
export type WallClock = { day: number; minutes: number };

/** Read once per model build and shared by every restaurant in it — a region's worth of
 * `formatToParts` calls every fifteen seconds would be work for nothing. */
export function algiersClock(now: number): WallClock {
  let day = 0;
  let hour = 0;
  let minute = 0;
  for (const part of WALL_CLOCK.formatToParts(now)) {
    if (part.type === 'weekday') day = Math.max(0, WEEKDAY_NAMES.indexOf(part.value));
    else if (part.type === 'hour') hour = Number(part.value);
    else if (part.type === 'minute') minute = Number(part.value);
  }
  return { day, minutes: hour * 60 + minute };
}

/** Minutes since midnight, or null when the time was never set. Comparing whole minutes
 * is exact here: the apps build each boundary with `setHours(h, mn, 0, 0)`. */
function minutesOf(time: ClockTime | undefined): number | null {
  if (!time || typeof time.h !== 'number') return null;
  return time.h * 60 + (time.mn ?? 0);
}

export function restaurantHours(row: RestaurantHoursFields, clock: WallClock): RestaurantHours {
  // Checkout wants `active` to be on, so a row that never had it set is off too.
  if (row.active !== true) return { state: 'paused' };

  const { openTime, closeTime, pauseStart, pauseEnd, workingDays } = row;
  const open = minutesOf(openTime);
  const close = minutesOf(closeTime);
  if (!openTime || !closeTime || open === null || close === null) return { state: 'unknown' };

  const { day, minutes } = clock;
  // No list at all means every day, as in checkout.
  if (workingDays && !workingDays.includes(day)) {
    return { state: 'closed', opensAt: null, isDayOff: true };
  }

  if (minutes < open) return { state: 'closed', opensAt: openTime, isDayOff: false };
  if (minutes >= close) return { state: 'closed', opensAt: null, isDayOff: false };

  const breakStart = minutesOf(pauseStart);
  const breakEnd = minutesOf(pauseEnd);
  if (pauseEnd && breakStart !== null && breakEnd !== null && minutes >= breakStart && minutes < breakEnd) {
    return { state: 'break', resumesAt: pauseEnd };
  }

  return { state: 'open', closesAt: closeTime };
}

/** '18:00' — the 24-hour clock both the apps and this console print times in. */
export function formatClockTime(time: ClockTime): string {
  const pad = (value: number | undefined) => String(value ?? 0).padStart(2, '0');
  return `${pad(time.h)}:${pad(time.mn)}`;
}
