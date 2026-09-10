import { CalendarDate, parseDate, today } from '@internationalized/date';
import { BUSINESS_TIME_ZONE } from '@/lib/format';

/**
 * The date presets the board offers.
 *
 * `all` exists because an operations console is also the thing someone opens when a
 * customer phones about an order from last month. Without an unbounded option, every
 * such lookup would silently return nothing and look like the order had been deleted.
 */
export const RANGE_PRESETS = ['today', 'yesterday', 'week', 'month', 'all', 'custom'] as const;

export type RangePreset = (typeof RANGE_PRESETS)[number];

export type DateRange = {
  preset: RangePreset;
  /** Inclusive first instant of the range in Algiers time, or null when unbounded. */
  start: Date | null;
  /** Inclusive last instant (23:59:59.999 Algiers), or null when unbounded. */
  end: Date | null;
  /** ISO calendar dates (YYYY-MM-DD) — what goes in the URL. Empty when unbounded. */
  from: string;
  to: string;
};

/** Parses a YYYY-MM-DD string, returning null rather than throwing on junk from the URL. */
export function parseCalendarDate(value: string | null | undefined): CalendarDate | null {
  if (!value) return null;
  try {
    const parsed = parseDate(value);
    return new CalendarDate(parsed.year, parsed.month, parsed.day);
  } catch {
    return null;
  }
}

function presetBounds(
  preset: Exclude<RangePreset, 'custom' | 'all'>,
): [CalendarDate, CalendarDate] {
  const now = today(BUSINESS_TIME_ZONE);

  switch (preset) {
    case 'yesterday': {
      const day = now.subtract({ days: 1 });
      return [day, day];
    }
    // "Last 7 days" counts today as one of the seven, which is what someone comparing
    // this week to the last means — not eight days ending yesterday.
    case 'week':
      return [now.subtract({ days: 6 }), now];
    case 'month':
      return [now.subtract({ days: 29 }), now];
    default:
      return [now, now];
  }
}

/** Resolves a preset (or a custom pair) into the instants a Parse `createdAt` filter needs. */
export function resolveRange(
  preset: RangePreset,
  from?: string | null,
  to?: string | null,
): DateRange {
  if (preset === 'all') {
    return { preset, start: null, end: null, from: '', to: '' };
  }

  let startDate: CalendarDate;
  let endDate: CalendarDate;

  if (preset === 'custom') {
    const now = today(BUSINESS_TIME_ZONE);
    const parsedFrom = parseCalendarDate(from);
    const parsedTo = parseCalendarDate(to);
    startDate = parsedFrom ?? now;
    endDate = parsedTo ?? startDate;
    // A range typed backwards is a slip, not a request for zero rows.
    if (endDate.compare(startDate) < 0) [startDate, endDate] = [endDate, startDate];
  } else {
    [startDate, endDate] = presetBounds(preset);
  }

  return {
    preset,
    start: startDate.toDate(BUSINESS_TIME_ZONE),
    // Midnight at the start of the day *after* the last one, minus a millisecond — the
    // only way to get an inclusive upper bound that survives DST without hand-rolling
    // 23:59:59.999.
    end: new Date(endDate.add({ days: 1 }).toDate(BUSINESS_TIME_ZONE).getTime() - 1),
    from: startDate.toString(),
    to: endDate.toString(),
  };
}

/** Narrows an arbitrary `?range=` value to a preset, defaulting to today. */
export function parsePreset(raw: string | null | undefined): RangePreset {
  return (RANGE_PRESETS as readonly string[]).includes(raw ?? '')
    ? (raw as RangePreset)
    : 'today';
}

/** Today's calendar date in Algiers, as YYYY-MM-DD — the ceiling for the custom inputs. */
export function todayIso(): string {
  return today(BUSINESS_TIME_ZONE).toString();
}
