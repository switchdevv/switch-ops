'use client';

import type { ReactNode } from 'react';
import { Button } from '@heroui/react';
import { useLogout } from '@/hooks/use-session';
import { useI18n } from '@/lib/i18n/provider';
import { BrandMark } from './brand-mark';

/**
 * The dead end for a signed-in account that may not use the console.
 *
 * The Sign out button is not decoration: this renders *instead* of the app while a
 * perfectly valid session is still live, so without it the user is parked on a screen
 * with no way forward and no way back — every route they can reach renders this same
 * page, and clearing the session by hand is not a thing to ask of anyone.
 */
export function NotAuthorized({
  title,
  description,
  action,
}: {
  title?: string;
  description?: string;
  /** Rendered before Sign out — a Retry, when the denial is really a failed check. */
  action?: ReactNode;
}) {
  const { t } = useI18n();
  const logout = useLogout();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <BrandMark className="size-12" />
      <div className="max-w-prose">
        <h1 className="text-h5 font-bold">{title ?? t('auth.noAccessTitle')}</h1>
        <p className="text-muted text-body mt-2">{description ?? t('auth.noAccessBody')}</p>
      </div>
      <div className="flex items-center gap-2">
        {action}
        <Button
          variant="secondary"
          size="sm"
          onPress={() => logout.mutate()}
          isDisabled={logout.isPending}
        >
          {logout.isPending ? t('nav.signingOut') : t('nav.signOut')}
        </Button>
      </div>
    </div>
  );
}
