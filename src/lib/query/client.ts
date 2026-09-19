import { QueryClient } from '@tanstack/react-query';
import { isAuthError, isTransientError } from '@/lib/parse/errors';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Shorter than switch-finance's minute: this console is a live view of work in
        // progress, so remounting the board should re-ask rather than paint an old picture
        // of the queue. Not the 10 s it used to be — every live screen polls at 15–30 s
        // already, and 10 s only meant that each alt-tab back to the console re-sent every
        // query on the page at once, against a backend that is one small instance.
        staleTime: 30_000,
        // On, unlike finance. Coming back to a tab that has been open all afternoon is
        // the single most common way someone looks at this screen, and stale rows there
        // are the exact failure the board exists to prevent.
        refetchOnWindowFocus: true,
        // Never `paused`. React Query's default ('online') parks a request started while it
        // believes the browser is offline until the tab is back online *and focused* — a
        // spinner with nothing behind it. Every request now carries a deadline
        // (lib/parse/deadline.ts), so trying and failing fast is the better answer.
        networkMode: 'always',
        // Permission and session failures surface at once (a retry can't change them);
        // a timeout or a dropped connection gets one more try, not two — nothing came
        // back, and a server in that state is only slowed by more of the same.
        retry: (failureCount, error) =>
          !isAuthError(error) && failureCount < (isTransientError(error) ? 1 : 2),
      },
      mutations: {
        // A paused mutation fires when the browser says it is back online — for dispatch,
        // an assign going out minutes after it was pressed. Fail now instead.
        networkMode: 'always',
      },
    },
  });
}
