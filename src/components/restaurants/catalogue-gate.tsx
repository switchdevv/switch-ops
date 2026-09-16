'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Alert, Button, Skeleton } from '@heroui/react';
import { useAccess } from '@/hooks/use-access';
import { pinnedRegionId } from '@/lib/auth/access';
import { useI18n } from '@/lib/i18n/provider';
import { parseErrorKey } from '@/lib/parse/errors';
import { RESTAURANTS_PATH } from '@/lib/url/restaurant-filters';
import { InboxIcon } from '@/components/icons';

/**
 * The part every single-restaurant page shares: wait for the row, say so if it failed or
 * doesn't exist, and keep a staff account inside its region.
 *
 * A restaurant, menu or dish in another region is answered exactly like a missing one — the
 * list never offers it, so the only way here is a pasted or hand-edited link, and "not in
 * your region" would confirm to that account that it exists. Same caveat as everywhere
 * region is pinned: a UX boundary, not a security one.
 */
export function CatalogueGate({
  status,
  error,
  regionId,
  exists,
  onRetry,
  children,
}: {
  status: 'pending' | 'error' | 'success';
  error: unknown;
  /** The region the loaded restaurant is in. */
  regionId: string | undefined;
  exists: boolean;
  onRetry: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const { region } = useAccess();
  const pinned = pinnedRegionId(region);

  if (status === 'pending') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-48 rounded-md" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <Alert status="danger">
        <Alert.Content>
          <Alert.Title>{t('catalogue.gate.errorTitle')}</Alert.Title>
          <Alert.Description>{t(parseErrorKey(error, 'fetch'))}</Alert.Description>
        </Alert.Content>
        <Button variant="secondary" size="sm" onPress={onRetry}>
          {t('common.retry')}
        </Button>
      </Alert>
    );
  }

  if (!exists || (pinned && regionId !== pinned)) {
    return (
      <div className="border-border/70 bg-surface rounded-card shadow-card flex flex-col items-center gap-2 border px-6 py-16 text-center">
        <span className="bg-surface-secondary text-muted mb-2 grid size-12 place-items-center rounded-2xl">
          <InboxIcon className="size-6" />
        </span>
        <p className="text-h6 font-bold">{t('catalogue.gate.notFoundTitle')}</p>
        <p className="text-muted text-body max-w-prose">{t('catalogue.gate.notFoundBody')}</p>
        <Link href={RESTAURANTS_PATH} className="text-body text-link mt-2 font-bold hover:underline">
          {t('catalogue.gate.back')}
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
