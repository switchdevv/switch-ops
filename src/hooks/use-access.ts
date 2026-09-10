'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/hooks/use-session';
import { queryKeys } from '@/lib/query/keys';
import { getAccessFor } from '@/lib/services/staff';
import { regionScope, staffRole, type RegionScope, type StaffRole } from '@/lib/auth/access';
import type { SwitchUser } from '@/types/user';

export type AccessState = {
  role: StaffRole;
  /** Which regions this account may look at — `all` for an admin, the one assigned
   * region for staff. Meaningless until `isPending` is false, like `role`. */
  region: RegionScope;
  /** The row the two answers above were derived from, so the shell can show the account
   * its own profile without asking the server a second time for what it just read. */
  account: SwitchUser | null;
  /** The session or the access row is still resolving — render a loader, never a verdict. */
  isPending: boolean;
  /** The access read itself failed. Distinct from `role === null` on purpose: a network
   * blip or a CLP change is not the same answer as "this account has no access", and
   * showing the denial screen for it would be a lie the user can't act on. */
  isError: boolean;
  error: unknown;
  refetch: () => void;
};

/**
 * The signed-in account's staff role, assigned region and profile, re-read from the
 * server on every page load.
 *
 * The round-trip is the whole point. `useSession` resolves from
 * `Parse.User.currentAsync()`, which reads localStorage — an account demoted in the
 * Parse dashboard would never be noticed by a browser that already holds a session, for
 * as long as its token lived. Re-reading the row means a demotion takes effect on the
 * next navigation instead of at session expiry.
 */
export function useAccess(): AccessState {
  const { data: user, isPending: sessionPending } = useSession();
  const objectId = user?.id ?? '';

  const query = useQuery({
    queryKey: queryKeys.access.current(objectId),
    queryFn: () => getAccessFor(objectId),
    enabled: objectId.length > 0,
    // Long enough that moving between pages doesn't re-ask on every navigation, short
    // enough that a revoked role surfaces within a minute rather than at session end.
    staleTime: 60_000,
  });

  return {
    role: staffRole(query.data),
    region: regionScope(query.data),
    account: query.data ?? null,
    // A disabled query sits in `pending` forever, so the session's own pending state is
    // what covers the window before there's an id to query with.
    isPending: sessionPending || (objectId.length > 0 && query.isPending),
    isError: query.isError,
    error: query.error,
    refetch: () => void query.refetch(),
  };
}
