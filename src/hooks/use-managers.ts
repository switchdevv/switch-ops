'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useInvalidateCatalogue } from '@/hooks/use-restaurants';
import type { DriverParams } from '@/lib/ops/driver-form';
import { queryKeys } from '@/lib/query/keys';
import {
  assignManagerRestaurant,
  createManager,
  getManager,
  getManagerAccount,
  listAssignableRestaurants,
  listManagers,
  messageManager,
  removeManagerFromRestaurant,
  resetManagerPassword,
  setManagerEnabled,
  updateManager,
} from '@/lib/services/managers';

/**
 * The managers change slowly — nobody's status here moves by the minute — so the list polls
 * only while Live is on, and on the Drivers list's slow clock.
 */
export const MANAGERS_INTERVAL_MS = 60_000;

export function useManagers(region: string, isLive: boolean, isEnabled = true) {
  return useQuery({
    queryKey: queryKeys.managers.list(region),
    queryFn: () => listManagers(region),
    placeholderData: keepPreviousData,
    refetchInterval: isLive ? MANAGERS_INTERVAL_MS : false,
    enabled: isEnabled,
  });
}

export function useManager(id: string) {
  return useQuery({
    queryKey: queryKeys.managers.detail(id),
    queryFn: () => getManager(id),
    enabled: id.length > 0,
  });
}

/** The account through `getUsers`, never considered fresh — see `useDriverAccount`. */
export function useManagerAccount(id: string, isEnabled: boolean) {
  return useQuery({
    queryKey: queryKeys.managers.account(id),
    queryFn: () => getManagerAccount(id),
    enabled: isEnabled && id.length > 0,
    staleTime: 0,
    // Read when a form opens — see `useDriverAccount`.
    refetchOnWindowFocus: false,
  });
}

export function useAssignableRestaurants(region: string, query: string) {
  return useQuery({
    queryKey: queryKeys.managers.restaurantOptions(region, query),
    queryFn: () => listAssignableRestaurants(region, query),
    placeholderData: keepPreviousData,
  });
}

/**
 * Everything a manager write can reach. The account's own screens, and — because
 * `toggleEnableUsers` switches the manager's restaurant and dishes too, and `assignManager`
 * rewrites the restaurant's `manager` — the whole catalogue, plus the Drivers list for an
 * account that is also a driver. Settled rather than success: a refusal usually means the
 * screen was behind.
 */
function useInvalidateManagers() {
  const queryClient = useQueryClient();
  const invalidateCatalogue = useInvalidateCatalogue();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.managers.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all });
    void queryClient.invalidateQueries({ queryKey: ['manager-candidate'] });
    invalidateCatalogue();
  };
}

export type ManagerWrite = { id: string; pinnedRegion: string };

export function useCreateManager() {
  const invalidate = useInvalidateManagers();
  return useMutation({
    mutationFn: (params: DriverParams) => createManager(params),
    onSettled: invalidate,
  });
}

export function useUpdateManager() {
  const invalidate = useInvalidateManagers();
  return useMutation({
    mutationFn: ({ id, params, pinnedRegion }: ManagerWrite & { params: DriverParams }) =>
      updateManager(id, params, pinnedRegion),
    onSettled: invalidate,
  });
}

export function useResetManagerPassword() {
  const invalidate = useInvalidateManagers();
  return useMutation({
    mutationFn: ({ id, password, pinnedRegion }: ManagerWrite & { password: string }) =>
      resetManagerPassword(id, password, pinnedRegion),
    onSettled: invalidate,
  });
}

export function useSetManagerEnabled() {
  const invalidate = useInvalidateManagers();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled, pinnedRegion }: ManagerWrite & { enabled: boolean }) =>
      setManagerEnabled(id, enabled, pinnedRegion),
    onSettled: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: queryKeys.queue.all });
    },
  });
}

export function useAssignManagerRestaurant() {
  const invalidate = useInvalidateManagers();
  return useMutation({
    mutationFn: ({ id, restaurantId, pinnedRegion }: ManagerWrite & { restaurantId: string }) =>
      assignManagerRestaurant(id, restaurantId, pinnedRegion),
    onSettled: invalidate,
  });
}

export function useRemoveManagerFromRestaurant() {
  const invalidate = useInvalidateManagers();
  return useMutation({
    mutationFn: ({ id, pinnedRegion }: ManagerWrite) => removeManagerFromRestaurant(id, pinnedRegion),
    onSettled: invalidate,
  });
}

/** A push changes nothing any screen reads. */
export function useMessageManager() {
  return useMutation({
    mutationFn: ({ id, title, body }: { id: string; title: string; body: string }) => messageManager(id, title, body),
  });
}
