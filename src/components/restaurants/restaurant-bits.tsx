'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Chip } from '@heroui/react';
import { initials } from '@/lib/format';
import { useI18n } from '@/lib/i18n/provider';
import type { RestaurantState } from '@/lib/ops/catalogue';
import { formatClockTime } from '@/lib/ops/restaurant-hours';
import type { ParseFileJSON } from '@/types/parse';
import { ChevronRightIcon } from '@/components/icons';

/**
 * Pieces the catalogue screens share: a picture, a restaurant's state, a breadcrumb.
 */

/**
 * A stored picture, or the name's initials when there isn't one.
 *
 * A plain `<img>` on purpose: these are Parse file URLs on another host, and `next/image`
 * in a static export can only pass them through unoptimised anyway — at the cost of a
 * config flag for every image in the app. Lazy, because a page of 25 rows is 25 photos.
 */
export function Thumb({
  picture,
  previewUrl,
  name,
  className,
}: {
  picture?: ParseFileJSON | null;
  /** A local preview (a `data:` URL) that wins over `picture`. */
  previewUrl?: string | null;
  name?: string;
  className?: string;
}) {
  const source = previewUrl ?? picture?.url;
  return (
    <span
      className={`bg-surface-tertiary text-muted grid shrink-0 place-items-center overflow-hidden font-bold uppercase ${className ?? 'size-12 rounded-xl'}`}
    >
      {source ? (
        // eslint-disable-next-line @next/next/no-img-element -- see the comment above
        <img src={source} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <span aria-hidden className="text-caption">
          {initials(name)}
        </span>
      )}
    </span>
  );
}

/** Whether customers can order from it right now, as a chip. */
export function RestaurantStateChip({ state, size = 'sm' }: { state: RestaurantState; size?: 'sm' | 'md' }) {
  const { t } = useI18n();

  const [color, label]: ['success' | 'warning' | 'danger' | 'default', string] = (() => {
    switch (state.state) {
      case 'disabled':
        return ['danger', t('catalogue.state.disabled')];
      case 'paused':
        return ['warning', t('dispatch.hours.paused')];
      case 'open':
        return ['success', t('dispatch.hours.openUntil', { time: formatClockTime(state.closesAt) })];
      case 'break':
        return ['warning', t('dispatch.hours.breakUntil', { time: formatClockTime(state.resumesAt) })];
      case 'closed':
        return [
          'default',
          state.isDayOff
            ? t('dispatch.hours.dayOff')
            : state.opensAt
              ? t('dispatch.hours.opensAt', { time: formatClockTime(state.opensAt) })
              : t('dispatch.hours.closed'),
        ];
      default:
        return ['default', t('dispatch.hours.unknown')];
    }
  })();

  return (
    <Chip color={color} variant="soft" size={size} className="gap-1.5 ps-2">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      <Chip.Label>{label}</Chip.Label>
    </Chip>
  );
}

/** A small tinted tag — featured, no commission, disabled. */
export function Tag({ tone, children }: { tone: 'accent' | 'warning' | 'danger' | 'muted'; children: ReactNode }) {
  const toneClass = {
    accent: 'bg-accent-soft text-accent-soft-foreground',
    warning: 'bg-warning-soft text-warning-soft-foreground',
    danger: 'bg-danger-soft text-danger-soft-foreground',
    muted: 'bg-default-soft text-default-soft-foreground',
  }[tone];
  return (
    <span className={`text-caption inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold whitespace-nowrap ${toneClass}`}>
      {children}
    </span>
  );
}

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const { t } = useI18n();
  return (
    <nav aria-label={t('catalogue.breadcrumbs')} className="text-caption text-muted flex min-w-0 flex-wrap items-center gap-1">
      {items.map((item, index) => (
        <span key={`${index}-${item.label}`} className="flex min-w-0 items-center gap-1">
          {index > 0 && <ChevronRightIcon aria-hidden className="text-faint size-3.5 shrink-0 rtl:rotate-180" />}
          {item.href ? (
            <Link href={item.href} className="hover:text-foreground truncate font-bold transition-colors">
              {item.label}
            </Link>
          ) : (
            <span aria-current="page" className="text-foreground truncate font-bold">
              {item.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}
