import { QueryClient } from '@tanstack/react-query';
import { isAuthError } from '@/lib/parse/errors';

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Shorter than switch-finance's 30s: this console is a live view of work in
        // progress, so remounting the board (a language switch, a back navigation)
        // should re-ask rather than paint a minute-old picture of the queue.
        staleTime: 10_000,
        // On, unlike finance. Coming back to a tab that has been open all afternoon is
        // the single most common way someone looks at this screen, and stale rows there
        // are the exact failure the board exists to prevent.
        refetchOnWindowFocus: true,
        // React Query retries 3x by default. Without this override, every
        // permission-denied or expired-session response would fire three identical
        // failing requests before surfacing — tripling the latency of the most common
        // error path instead of failing fast.
        retry: (failureCount, error) => !isAuthError(error) && failureCount < 2,
      },
    },
  });
}
