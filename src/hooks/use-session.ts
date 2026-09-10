'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import type { User as ParseUser } from 'parse';
import { getParse } from '@/lib/parse/client';
import { queryKeys } from '@/lib/query/keys';

/**
 * The query cache IS the session store — no separate AuthProvider or context.
 *
 * Initial state is `pending` on both the server render and the first client render
 * (queryFn never runs during SSR), which is what makes RequireAuth's anti-flash
 * behaviour free: identical markup on both renders, and neither the login form nor the
 * board is shown before the session is known.
 */
export function useSession() {
  return useQuery({
    queryKey: queryKeys.session,
    queryFn: () => getParse().User.currentAsync<ParseUser>(),
    staleTime: Infinity, // only the mutations below change this; never refetch it
    retry: false,
  });
}

type Credentials = { username: string; password: string };

/**
 * Sign-in, through the platform's `loginStaff` cloud function.
 *
 * **Not `Parse.User.logIn`.** This is the same two-step switch-dashboard performs
 * (src/pages/Login/Login.jsx): the function authenticates *and authorizes* on the
 * server — refusing a non-staff account with `USER_UNAUTHORIZED` before any session
 * exists — then returns a session token that `become()` adopts locally.
 *
 * The difference matters. `logIn` would hand a valid session to any customer of the
 * food app who guessed this URL, leaving the console to log them straight back out
 * again on the client; here a customer never gets a token at all, and the rule that
 * decides it lives on the server where it cannot be edited by the caller.
 */
export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ username, password }: Credentials) => {
      const Parse = getParse();
      const { sessionToken } = await Parse.Cloud.run<
        (params: Credentials) => { sessionToken: string }
      >('loginStaff', { username, password });
      return Parse.User.become<ParseUser>(sessionToken);
    },
    onSuccess: (user) => {
      // Written straight into the cache instead of invalidating and refetching — the
      // response already IS the session, so a second round-trip to re-learn what was
      // just returned would be pure waste.
      queryClient.setQueryData(queryKeys.session, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: () => getParse().User.logOut(),
    // onSettled, not onSuccess: logOut() can itself throw when the session token is
    // already dead server-side, and the user must not be stuck looking signed-in just
    // because the server half of the logout failed.
    onSettled: () => {
      queryClient.setQueryData(queryKeys.session, null);
      // Purges every other cached query too, so a differently-permissioned account
      // signing in next can't briefly render this account's rows before its own land.
      queryClient.clear();
      router.replace('/login');
    },
  });
}
