'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Alert, Button, Chip, Skeleton } from '@heroui/react';
import { initials } from '@/lib/format';
import { useI18n } from '@/lib/i18n/provider';
import {
  DRIVER_STATUS_LABEL_KEY,
  DRIVER_STATUS_TONE,
  type DriverStatus,
  type DriverView,
} from '@/lib/ops/drivers';
import { parseErrorKey } from '@/lib/parse/errors';
import { DRIVERS_PATH } from '@/lib/url/driver-filters';
import type { ParseFileJSON } from '@/types/parse';
import { InboxIcon, SignalOffIcon } from '@/components/icons';

/**
 * Pieces the Drivers screens share: a face, a status, the line that says when the app was
 * last heard from, and the gate a single driver's page waits behind.
 */

/**
 * The driver's profile picture, or their initials.
 *
 * A plain `<img>` for the reason `Thumb` in components/restaurants/restaurant-bits.tsx
 * gives: Parse file URLs on another host, which `next/image` in a static export can only
 * pass through unoptimised anyway. Round, where a restaurant's is square — a person, not a
 * storefront.
 */
export function DriverAvatar({
  picture,
  name,
  className,
}: {
  picture?: ParseFileJSON | null;
  name?: string;
  className?: string;
}) {
  return (
    <span
      className={`bg-surface-tertiary text-muted grid shrink-0 place-items-center overflow-hidden rounded-full font-bold uppercase ${className ?? 'size-11'}`}
    >
      {picture?.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- see the comment above
        <img src={picture.url} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <span aria-hidden className="text-caption">
          {initials(name)}
        </span>
      )}
    </span>
  );
}

/** A driver's status as a chip — the dot repeats the colour, as `StageChip` does, so the
 * state doesn't rest on hue alone. */
export function DriverStatusChip({ status, size = 'sm' }: { status: DriverStatus; size?: 'sm' | 'md' }) {
  const { t } = useI18n();
  return (
    <Chip color={DRIVER_STATUS_TONE[status]} variant="soft" size={size} className="gap-1.5 ps-2">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      <Chip.Label>{t(DRIVER_STATUS_LABEL_KEY[status])}</Chip.Label>
    </Chip>
  );
}

const TONE_CLASS = {
  accent: 'bg-accent-soft text-accent-soft-foreground',
  warning: 'bg-warning-soft text-warning-soft-foreground',
  danger: 'bg-danger-soft text-danger-soft-foreground',
  queued: 'bg-queued-soft text-queued-soft-foreground',
  muted: 'bg-surface-tertiary text-muted',
} as const;

/** A small tinted tag. `queued` is the queue's own violet, as on the map. */
export function Tag({ tone, children }: { tone: keyof typeof TONE_CLASS; children: ReactNode }) {
  return (
    <span
      className={`text-caption inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-bold whitespace-nowrap ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * When the driver's app was last heard from, said the way that matters for their status:
 *
 * - working (online or delivering) and reporting — "Seen 2 min ago";
 * - working, but silent past the signal timeout — "No signal · 12 min", loudly, because
 *   that driver is not where the map says;
 * - not working — "Last active 3 days ago".
 *
 * "Heard from" is the row's `updatedAt`, which the driver app rewrites at least once a
 * minute while online. Any other write to the row moves it too (an edit from here, say), so
 * for an offline account it is an approximation, and says so by not claiming more than a
 * relative time.
 */
export function SeenText({ driver, now }: { driver: Pick<DriverView, 'status' | 'seenAt' | 'isSignalLost'>; now: number }) {
  const { t, format } = useI18n();

  if (driver.seenAt === null) return <span className="text-faint">{t('drivers.row.neverSeen')}</span>;

  const iso = new Date(driver.seenAt).toISOString();
  const isWorking = driver.status === 'online' || driver.status === 'delivering';

  if (isWorking && driver.isSignalLost) {
    return (
      <span className="text-warning-soft-foreground inline-flex items-center gap-1 font-bold">
        <SignalOffIcon aria-hidden className="size-3.5" />
        {t('drivers.row.noSignal', { duration: format.elapsed(iso, now) })}
      </span>
    );
  }

  return (
    <span className="text-faint">
      {t(isWorking ? 'drivers.row.seen' : 'drivers.row.lastActive', { time: format.relative(iso, now) })}
    </span>
  );
}

/**
 * A single driver's page waits behind this: the row loading, failing, or not there.
 *
 * A driver outside a staff account's region is answered exactly like a missing one — the
 * same rule as `CatalogueGate`, for the same reason: the list never offers one, so the only
 * way here is a pasted link, and "not in your region" would confirm the account exists. A
 * UX boundary, not a security one.
 */
export function DriverGate({
  status,
  error,
  isVisible,
  onRetry,
  children,
}: {
  status: 'pending' | 'error' | 'success';
  error: unknown;
  /** Loaded, a driver, and inside the account's region. */
  isVisible: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();

  if (status === 'pending') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-48 rounded-md" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <Alert status="danger">
        <Alert.Content>
          <Alert.Title>{t('drivers.gate.errorTitle')}</Alert.Title>
          <Alert.Description>{t(parseErrorKey(error, 'fetch'))}</Alert.Description>
        </Alert.Content>
        <Button variant="secondary" size="sm" onPress={onRetry}>
          {t('common.retry')}
        </Button>
      </Alert>
    );
  }

  if (!isVisible) {
    return (
      <div className="border-border/70 bg-surface rounded-card shadow-card flex flex-col items-center gap-2 border px-6 py-16 text-center">
        <span className="bg-surface-secondary text-muted mb-2 grid size-12 place-items-center rounded-2xl">
          <InboxIcon className="size-6" />
        </span>
        <p className="text-h6 font-bold">{t('drivers.gate.notFoundTitle')}</p>
        <p className="text-muted text-body max-w-prose">{t('drivers.gate.notFoundBody')}</p>
        <Link href={DRIVERS_PATH} className="text-body text-link mt-2 font-bold hover:underline">
          {t('drivers.gate.back')}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}

/** The red box a dialog shows when its last attempt failed. */
export function DialogError({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="bg-danger-soft text-danger-soft-foreground flex items-start gap-2 rounded-xl p-2.5">
      <span aria-hidden className="mt-0.5 size-1.5 shrink-0 rounded-full bg-current" />
      <p className="text-caption">{children}</p>
    </div>
  );
}

/** An amber line inside a dialog — something to know before pressing the button. */
export function DialogWarning({ children }: { children: ReactNode }) {
  return (
    <p className="text-caption bg-warning-soft text-warning-soft-foreground rounded-lg px-2.5 py-1.5 font-bold">
      {children}
    </p>
  );
}
