'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Alert, Button, Chip, Skeleton } from '@heroui/react';
import { useI18n } from '@/lib/i18n/provider';
import { MANAGER_STATUS_LABEL_KEY, MANAGER_STATUS_TONE, type ManagerStatus, type RestaurantLink } from '@/lib/ops/managers';
import { parseErrorKey } from '@/lib/parse/errors';
import { MANAGERS_PATH } from '@/lib/url/manager-filters';
import { InboxIcon } from '@/components/icons';
import { Tag } from '@/components/drivers/driver-bits';

/**
 * Pieces the Managers screens share. The face, the tags and the dialog boxes are the
 * Drivers screens' own (components/drivers/driver-bits.tsx) — a person is drawn the same way
 * whichever app they work in.
 */

export function ManagerStatusChip({ status, size = 'sm' }: { status: ManagerStatus; size?: 'sm' | 'md' }) {
  const { t } = useI18n();
  return (
    <Chip color={MANAGER_STATUS_TONE[status]} variant="soft" size={size} className="gap-1.5 ps-2">
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      <Chip.Label>{t(MANAGER_STATUS_LABEL_KEY[status])}</Chip.Label>
    </Chip>
  );
}

/** The tag for a restaurant link that is broken one way or the other. Nothing for a
 * healthy one, or for none at all — the status already says "No restaurant". */
export function RestaurantLinkTag({ link }: { link: RestaurantLink }) {
  const { t } = useI18n();
  if (link === 'missing') return <Tag tone="danger">{t('managers.row.restaurantMissing')}</Tag>;
  if (link === 'mismatch') return <Tag tone="warning">{t('managers.row.restaurantMismatch')}</Tag>;
  return null;
}

/** A single manager's page waits behind this — see `DriverGate`, whose rules it keeps. */
export function ManagerGate({
  status,
  error,
  isVisible,
  onRetry,
  children,
}: {
  status: 'pending' | 'error' | 'success';
  error: unknown;
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
          <Alert.Title>{t('managers.gate.errorTitle')}</Alert.Title>
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
        <p className="text-h6 font-bold">{t('managers.gate.notFoundTitle')}</p>
        <p className="text-muted text-body max-w-prose">{t('managers.gate.notFoundBody')}</p>
        <Link href={MANAGERS_PATH} className="text-body text-link mt-2 font-bold hover:underline">
          {t('managers.gate.back')}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
