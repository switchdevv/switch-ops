'use client';

import type { MessageKey, Vars } from '@/lib/i18n/dictionary';
import { useI18n } from '@/lib/i18n/provider';
import { formatClockTime, type RestaurantHours } from '@/lib/ops/restaurant-hours';

/**
 * A restaurant's hours as one phrase — "Open until 23:00", "Closed · opens at 18:00" —
 * shared by the Restaurants tab and the restaurant's detail, so the two never word the
 * same state differently.
 */

type Translate = (key: MessageKey, vars?: Vars) => string;

function hoursLabel(hours: RestaurantHours, t: Translate): string {
  switch (hours.state) {
    case 'open':
      return t('dispatch.hours.openUntil', { time: formatClockTime(hours.closesAt) });
    case 'break':
      return t('dispatch.hours.breakUntil', { time: formatClockTime(hours.resumesAt) });
    case 'paused':
      return t('dispatch.hours.paused');
    case 'closed':
      if (hours.opensAt) return t('dispatch.hours.opensAt', { time: formatClockTime(hours.opensAt) });
      return t(hours.isDayOff ? 'dispatch.hours.dayOff' : 'dispatch.hours.closed');
    case 'unknown':
      return t('dispatch.hours.unknown');
  }
}

/** Loud only where a call might be due: a kitchen that is in its hours and still not
 * taking orders. Closed is simply quiet. */
const TONE_CLASS: Record<RestaurantHours['state'], string> = {
  open: 'text-muted',
  break: 'text-warning-soft-foreground font-bold',
  paused: 'text-warning-soft-foreground font-bold',
  closed: 'text-faint',
  unknown: 'text-faint',
};

export function HoursText({ hours, className }: { hours: RestaurantHours; className?: string }) {
  const { t } = useI18n();
  return <span className={`${TONE_CLASS[hours.state]} ${className ?? ''}`}>{hoursLabel(hours, t)}</span>;
}
