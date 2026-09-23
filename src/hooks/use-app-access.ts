'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useActor } from '@/hooks/use-customers';
import type { AppAccessAccount, AppAccessPlan } from '@/lib/ops/app-access';
import { queryKeys } from '@/lib/query/keys';
import { getAppAccessAccount, saveAppAccess } from '@/lib/services/app-access';

/** Read when the dialog opens and never kept: the boxes must start from the server's row. */
export function useAppAccessAccount(userId: string) {
  return useQuery({
    queryKey: queryKeys.appAccess(userId),
    queryFn: () => getAppAccessAccount(userId),
    enabled: userId.length > 0,
    staleTime: 0,
    gcTime: 0,
  });
}

/** A change of apps moves the account between the Customers, Drivers, Managers and Access
 * lists, and a driver taken off the driver app out of the queue — all of them re-read. */
export function useSaveAppAccess() {
  const actor = useActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ shown, plan }: { shown: AppAccessAccount; plan: AppAccessPlan }) => saveAppAccess(shown, plan, actor),
    onSettled: () => {
      for (const key of [
        queryKeys.customers.all,
        queryKeys.drivers.all,
        queryKeys.managers.all,
        queryKeys.staff.all,
        queryKeys.dispatch.all,
        queryKeys.queue.all,
      ]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}
