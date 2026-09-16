'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PageResult } from '@/lib/parse/query';
import { queryKeys } from '@/lib/query/keys';
import { listStaff, setOpsAccess } from '@/lib/services/staff';
import type { AccessFilters } from '@/lib/url/access-filters';
import type { SwitchUser } from '@/types/user';

/** The staff pool on /access, one page at a time. */
export function useStaffAccounts(filters: AccessFilters, page: number) {
  return useQuery({
    queryKey: queryKeys.staff.list(filters, page),
    queryFn: () => listStaff(filters, page),
    placeholderData: keepPreviousData,
  });
}

export type SetOpsAccessVars = { userId: string; granted: boolean };

export function useSetOpsAccess() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, granted }: SetOpsAccessVars) => setOpsAccess(userId, granted),
    onSuccess: (_data, { userId, granted }) => {
      // The answer goes into every cached page first, so the row's switch lands on the new
      // value the moment it lets go of its optimistic one — instead of flicking back to the
      // old value for as long as the re-read below takes.
      queryClient.setQueriesData<PageResult<SwitchUser>>({ queryKey: queryKeys.staff.all }, (page) =>
        page
          ? {
              ...page,
              results: page.results.map((row) => (row.objectId === userId ? { ...row, opsAccess: granted } : row)),
            }
          : page,
      );
      // Re-read anyway: under a "has access" filter the row no longer belongs on the page.
      void queryClient.invalidateQueries({ queryKey: queryKeys.staff.all });
      // And that account's own access row, which is what the gate reads — so a console open
      // on the same browser under that account doesn't keep the old answer for a minute.
      void queryClient.invalidateQueries({ queryKey: queryKeys.access.current(userId) });
    },
  });
}
