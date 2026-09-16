'use client';

import type { ReactNode } from 'react';
import { useAccess } from '@/hooks/use-access';
import { useI18n } from '@/lib/i18n/provider';
import { ShieldIcon } from './icons';

/**
 * The second, narrower gate: admin-only page bodies.
 *
 * RequireAuth has already established a session and some access by the time this renders,
 * so all it separates is `admin` from `staff`. The nav item is hidden from staff too (see
 * app-shell), but hiding a link is not a check — the URL is typeable.
 *
 * Inline rather than NotAuthorized: this sits inside the shell's <main>, where that
 * component's full-viewport centring would overflow, and its Sign out button would be the
 * second one on screen.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { role, isPending } = useAccess();

  // Warm from RequireAuth, so in practice never shown.
  if (isPending) {
    return <div className="border-border/70 rounded-card h-64 animate-pulse border" />;
  }

  if (role !== 'admin') {
    return (
      <section className="border-border/70 bg-surface rounded-card shadow-card flex flex-col items-center gap-2 border px-6 py-20 text-center">
        <span className="bg-surface-secondary text-muted mb-2 grid size-12 place-items-center rounded-2xl">
          <ShieldIcon className="size-6" />
        </span>
        <p className="text-h6 font-bold">{t('access.adminsOnlyTitle')}</p>
        <p className="text-muted text-body max-w-prose">{t('access.adminsOnlyBody')}</p>
      </section>
    );
  }

  return <>{children}</>;
}
