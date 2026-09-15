'use client';

import { useI18n } from '@/lib/i18n/provider';
import { BagIcon } from '@/components/icons';

/**
 * The mark every pickup carries, wherever an order is listed — the board's row, the map's
 * list, the order's own detail, the confirm step.
 *
 * Solid ink rather than another tint, on purpose. Every hue on these screens already
 * means a *state* (red needs a driver, amber waits on the restaurant, violet is queued,
 * blue is with a driver, green is a free driver), and a pickup is not a state: it is a
 * different kind of order, one no driver will ever touch. An inverted pill with a bag
 * reads as "different kind" at a glance, survives being colourblind, and sits beside a
 * state tag without competing for what the colour means.
 */
export function PickupBadge({ size = 'sm', className }: { size?: 'sm' | 'md'; className?: string }) {
  const { t } = useI18n();

  return (
    <span
      className={
        'bg-foreground text-background inline-flex w-fit shrink-0 items-center gap-1 rounded-full font-bold whitespace-nowrap uppercase ' +
        (size === 'md' ? 'text-caption px-2.5 py-1 tracking-[0.06em] ' : 'text-micro px-1.5 py-0.5 tracking-[0.08em] ') +
        (className ?? '')
      }
    >
      <BagIcon aria-hidden className={size === 'md' ? 'size-3.5' : 'size-3'} />
      {t('orders.type.pickup')}
    </span>
  );
}
