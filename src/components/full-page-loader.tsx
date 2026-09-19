'use client';

import { useEffect, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { useLogout } from '@/hooks/use-session';
import { useI18n } from '@/lib/i18n/provider';
import { BrandMark } from './brand-mark';

/** How long the loader spins before it admits it is waiting and offers a way out. */
export const SLOW_START_MS = 8_000;

/**
 * Rendered while the console can't show anything yet — the session and access check (see
 * RequireAuth), a redirect in flight. Never rendered alongside the login form or the
 * board; that is what keeps first paint from flashing either one before the session is
 * actually known.
 *
 * It never spins without end. After `SLOW_START_MS` it says so and offers the two things
 * that can help: trying again (the caller's own retry, or a reload), and — where there is a
 * session to leave — signing out.
 */
export function FullPageLoader({
  onRetry,
  canSignOut = false,
}: {
  /** What Retry does. A full reload when omitted. */
  onRetry?: () => void;
  /** Offer Sign out once it is slow — only where a session exists. */
  canSignOut?: boolean;
}) {
  const { t } = useI18n();
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsSlow(true), SLOW_START_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <BrandMark className="size-12" />
      <Spinner size="sm" color="accent" aria-label={t('common.loading')} />
      {isSlow && <SlowNotice onRetry={onRetry} canSignOut={canSignOut} />}
    </div>
  );
}

function SlowNotice({ onRetry, canSignOut }: { onRetry?: () => void; canSignOut: boolean }) {
  const { t } = useI18n();
  const logout = useLogout();

  return (
    <div className="flex max-w-prose flex-col items-center gap-3" role="status">
      <div>
        <p className="text-body font-bold">{t('auth.slowTitle')}</p>
        <p className="text-caption text-muted mt-1">{t('auth.slowBody')}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" onPress={() => (onRetry ? onRetry() : window.location.reload())}>
          {t('auth.tryAgain')}
        </Button>
        {canSignOut && (
          <Button variant="secondary" size="sm" onPress={() => logout.mutate()} isDisabled={logout.isPending}>
            {logout.isPending ? t('nav.signingOut') : t('nav.signOut')}
          </Button>
        )}
      </div>
    </div>
  );
}
