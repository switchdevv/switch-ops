'use client';

import { Spinner } from '@heroui/react';
import { useI18n } from '@/lib/i18n/provider';
import { BrandMark } from './brand-mark';

/**
 * Rendered while the session query is pending — see RequireAuth. Never rendered
 * alongside the login form or the board; that is what keeps first paint from flashing
 * either one before the session is actually known.
 */
export function FullPageLoader() {
  const { t } = useI18n();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5">
      <BrandMark className="size-12" />
      <Spinner size="sm" color="accent" aria-label={t('common.loading')} />
    </div>
  );
}
