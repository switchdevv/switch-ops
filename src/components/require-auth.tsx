'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@heroui/react';
import { useLogout, useSession } from '@/hooks/use-session';
import { useAccess } from '@/hooks/use-access';
import { useI18n } from '@/lib/i18n/provider';
import { isSessionExpired, parseErrorKey } from '@/lib/parse/errors';
import { FullPageLoader } from './full-page-loader';
import { NotAuthorized } from './not-authorized';

/**
 * UX gate, not a security boundary.
 *
 * The session lives in localStorage, which a server-side Next proxy cannot see (it
 * would treat every request as anonymous), so this can only run client-side, after the
 * bundle has loaded. Real protection is server-side: `loginStaff` refuses to mint a
 * session for a non-staff account in the first place, and the Parse ACL/CLP rejects a
 * request without a valid token regardless of what this component renders.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { data: user, isPending } = useSession();
  const access = useAccess();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isPending && !user) {
      // The query string is part of where the user was trying to go, not decoration —
      // the whole state of the board lives in it (see lib/url/order-filters.ts), so
      // sending only the pathname through the login round-trip would drop the filters
      // of whoever shared the link. Read from `location` rather than useSearchParams(),
      // which would oblige every layout using this to sit inside a Suspense boundary;
      // this only ever runs in the browser.
      const target = pathname + window.location.search;
      router.replace(`/login?next=${encodeURIComponent(target)}`);
    }
  }, [isPending, user, pathname, router]);

  // A session the server no longer honours (a password reset revokes every one) can't be
  // fixed by trying again, so don't offer that: sign out, which lands on /login. Once.
  const { mutate: signOut } = useLogout();
  const isDeadSession = access.isError && isSessionExpired(access.error);
  const hasSignedOut = useRef(false);
  useEffect(() => {
    if (!isDeadSession || hasSignedOut.current) return;
    hasSignedOut.current = true;
    signOut();
  }, [isDeadSession, signOut]);

  if (isPending || !user || access.isPending || isDeadSession) {
    return <FullPageLoader onRetry={user ? access.refetch : undefined} canSignOut={!!user} />;
  }

  // A failed check is not a denial. The access row is read over the network, so this
  // branch — reached only when no row was ever confirmed on this browser (see
  // hooks/use-access.ts) — is a dropped connection or a CLP change — telling someone they have no
  // access when the truth is "we couldn't ask" sends them to an admin for a problem an
  // admin can't fix. Offer the retry instead.
  if (access.isError) {
    return (
      <NotAuthorized
        title={t('auth.verifyFailedTitle')}
        description={t(parseErrorKey(access.error, 'fetch'))}
        action={
          <Button variant="primary" size="sm" onPress={access.refetch}>
            {t('auth.tryAgain')}
          </Button>
        }
      />
    );
  }

  if (access.role === null) return <NotAuthorized />;

  // A staff account with no region on its row. Not a denial — the account is staff and
  // the platform says so — but there is no board to show it: every query this console
  // runs would be pinned to a region that doesn't exist, and an empty list under a
  // working filter bar reads as an outage rather than as missing setup. Naming the
  // problem is the only thing that gets it fixed. See `regionScope` in lib/auth/access.
  if (access.region.kind === 'unassigned') {
    return (
      <NotAuthorized title={t('auth.noRegionTitle')} description={t('auth.noRegionBody')} />
    );
  }

  return <>{children}</>;
}
