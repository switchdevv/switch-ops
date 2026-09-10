import { INTL_LOCALES, type Locale } from '@/lib/i18n/locales';
import type { CurrencyCode } from '@/types/city';

/**
 * Day boundaries and clock times are Algiers', not UTC and not the viewer's.
 *
 * A dispatcher in another timezone looking at the board has to see the same "today" as
 * the person in the office, or the two of them disagree about which orders are open.
 * This is the same constant switch-finance pins its reports to.
 */
export const BUSINESS_TIME_ZONE = 'Africa/Algiers';

/** The symbols the RN apps print these currencies with
 * (switch-driver/src/localization/langs/*.json → `currency`). */
const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = { dzd: 'DA', usd: '$', eur: '€' };

export type Formatters = ReturnType<typeof makeFormatters>;

/**
 * Every `Intl` object this app needs, built once per locale.
 *
 * Constructing an `Intl.DateTimeFormat` is expensive enough that doing it inside a table
 * cell is measurable on a 50-row page; the provider memoises the whole bundle by locale
 * (see lib/i18n/provider.tsx) so a row just calls a closure.
 */
export function makeFormatters(locale: Locale) {
  const tag = INTL_LOCALES[locale];

  const dateTime = new Intl.DateTimeFormat(tag, {
    timeZone: BUSINESS_TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const dateOnly = new Intl.DateTimeFormat(tag, {
    timeZone: BUSINESS_TIME_ZONE,
    dateStyle: 'medium',
  });
  const timeOnly = new Intl.DateTimeFormat(tag, {
    timeZone: BUSINESS_TIME_ZONE,
    timeStyle: 'short',
  });
  const clock = new Intl.DateTimeFormat(tag, {
    timeZone: BUSINESS_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  // UTC on purpose: it names a weekday *number*, formatted from a fixed UTC date, so no
  // zone can shift it onto the neighbouring day.
  const weekday = new Intl.DateTimeFormat(tag, { weekday: 'short', timeZone: 'UTC' });
  const number = new Intl.NumberFormat(tag);
  const money = new Intl.NumberFormat(tag, { maximumFractionDigits: 2 });
  const distanceKm = new Intl.NumberFormat(tag, { maximumFractionDigits: 1 });
  // `numeric: 'auto'` is what turns -1 day into "yesterday" / "hier" instead of
  // "1 day ago" — the phrasing a human actually uses, in whichever language.
  const relative = new Intl.RelativeTimeFormat(tag, { numeric: 'auto', style: 'short' });

  function dateOf(iso: string | undefined | null): Date | null {
    if (!iso) return null;
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return {
    locale,
    tag,

    /** Full stamp: '10 Sep 2026, 14:32'. */
    dateTime: (iso: string | undefined | null) => {
      const date = dateOf(iso);
      return date ? dateTime.format(date) : '—';
    },

    date: (iso: string | undefined | null) => {
      const date = dateOf(iso);
      return date ? dateOnly.format(date) : '—';
    },

    time: (iso: string | undefined | null) => {
      const date = dateOf(iso);
      return date ? timeOnly.format(date) : '';
    },

    /** 24-hour HH:MM, for the timestamp column where every row must align. */
    clock: (iso: string | undefined | null) => {
      const date = dateOf(iso);
      return date ? clock.format(date) : '—';
    },

    /**
     * '4 min ago', 'il y a 4 min'. `now` is passed in rather than read from the clock
     * so that a whole render pass agrees with itself — otherwise two rows a millisecond
     * apart can round to different minutes, and the value changes on every unrelated
     * re-render, which React's own concurrent renders make visible as flicker.
     */
    relative: (iso: string | undefined | null, now: number) => {
      const date = dateOf(iso);
      if (!date) return '—';
      const seconds = Math.round((date.getTime() - now) / 1000);
      const magnitude = Math.abs(seconds);
      if (magnitude < 60) return relative.format(Math.round(seconds), 'second');
      if (magnitude < 3600) return relative.format(Math.round(seconds / 60), 'minute');
      if (magnitude < 86_400) return relative.format(Math.round(seconds / 3600), 'hour');
      return relative.format(Math.round(seconds / 86_400), 'day');
    },

    /** Elapsed time as a bare span ('12 min', '2 h 05'), for "waiting since". */
    elapsed: (fromIso: string | undefined | null, now: number) => {
      const date = dateOf(fromIso);
      if (!date) return '—';
      const minutes = Math.max(0, Math.round((now - date.getTime()) / 60_000));
      if (minutes < 60) return `${number.format(minutes)} min`;
      const hours = Math.floor(minutes / 60);
      return `${number.format(hours)} h ${String(minutes % 60).padStart(2, '0')}`;
    },

    /** 'Sun', 'dim.' — for a JavaScript weekday number (0 = Sunday), which is how
     * `Restaurant.workingDays` stores them. 1 January 2023 was a Sunday. */
    weekday: (day: number) => weekday.format(Date.UTC(2023, 0, 1 + day)),

    number: (value: number | undefined | null) =>
      value === undefined || value === null ? '—' : number.format(value),

    /**
     * Money as the RN apps write it: amount then symbol, '1 250 DA'. Not
     * `Intl.NumberFormat`'s currency mode, which renders DZD as 'DZD 1,250' — not what
     * anyone at Switch reads on a receipt.
     *
     * Currency comes from the order's city. When it is missing the amount is shown bare
     * rather than guessed into dinars.
     */
    money: (value: number | undefined | null, currency: CurrencyCode | undefined) => {
      if (value === undefined || value === null || Number.isNaN(value)) return '—';
      const amount = money.format(value);
      const symbol = currency ? CURRENCY_SYMBOLS[currency] : undefined;
      return symbol ? `${amount} ${symbol}` : amount;
    },

    /** `Order.distance` is metres, as the driver app recorded it. */
    distance: (metres: number | undefined | null) => {
      if (metres === undefined || metres === null) return '—';
      return metres < 1000
        ? `${number.format(Math.round(metres))} m`
        : `${distanceKm.format(metres / 1000)} km`;
    },

    /** `Order.duration` is seconds of estimated travel. */
    duration: (seconds: number | undefined | null) => {
      if (seconds === undefined || seconds === null) return '—';
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) return `${number.format(minutes)} min`;
      return `${number.format(Math.floor(minutes / 60))} h ${String(minutes % 60).padStart(2, '0')}`;
    },
  };
}

/**
 * Orders are identified by their objectId, and the full 10 characters are noise in a
 * dense row. The tail is what differs between neighbours, so that's what is shown — the
 * full id is always one copy button away.
 */
export function shortId(objectId: string | undefined): string {
  return objectId ? objectId.slice(-6).toUpperCase() : '—';
}

/** Two-letter fallback for a picture-less avatar. Works on Arabic names too, where the
 * first characters are the meaningful ones just as they are in Latin. */
export function initials(name: string | undefined): string {
  if (!name) return '—';
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '—';
  if (words.length === 1) return words[0].slice(0, 2);
  return (words[0][0] ?? '') + (words[1][0] ?? '');
}

/**
 * Phone fields hold one number or several joined by '/' (see the Restaurant rows in
 * switch-manager). Split so a card can show the first as the number to call and the
 * rest as alternatives, instead of one unreadable run.
 */
export function splitPhones(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .split(/[/,]/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
