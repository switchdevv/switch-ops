'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DateRange } from '@/lib/ops/date-range';
import type { DriverParams } from '@/lib/ops/driver-form';
import { queryKeys } from '@/lib/query/keys';
import {
  createDriver,
  getDriver,
  getDriverAccount,
  listDriverDeliveries,
  listDrivers,
  messageDriver,
  resetDriverPassword,
  setDriverEnabled,
  updateDriver,
} from '@/lib/services/drivers';

/**
 * How often the fleet is re-read while Live is on.
 *
 * Slower than the map's fifteen seconds: this read is up to a thousand rows rather than the
 * drivers online right now, and what changes on it — someone going online or offline — is
 * not something a list of the fleet has to show within seconds. The two things that do move
 * fast, who is carrying what and who has a queue, come from the map's own reads, which keep
 * their own clock (see `useOngoingOrders` and `useDispatchQueue`).
 */
export const DRIVERS_INTERVAL_MS = 30_000;

/** Every driver in the region. */
export function useDrivers(region: string, isLive: boolean, isEnabled = true) {
  return useQuery({
    queryKey: queryKeys.drivers.list(region),
    queryFn: () => listDrivers(region),
    placeholderData: keepPreviousData,
    refetchInterval: isLive ? DRIVERS_INTERVAL_MS : false,
    enabled: isEnabled,
  });
}

/** One driver's row, re-read on the same clock as the list so "last active" stays true. */
export function useDriver(id: string) {
  return useQuery({
    queryKey: queryKeys.drivers.detail(id),
    queryFn: () => getDriver(id),
    refetchInterval: DRIVERS_INTERVAL_MS,
    enabled: id.length > 0,
  });
}

/**
 * The driver's account through `getUsers` — email included — for the edit form and the
 * detail's profile card. Only asked for when something shows it (`isEnabled`), because it
 * is a cloud call returning the whole row, and never considered fresh: a form opened on a
 * minute-old copy is the stale-edit this read exists to prevent.
 */
export function useDriverAccount(id: string, isEnabled: boolean) {
  return useQuery({
    queryKey: queryKeys.drivers.account(id),
    queryFn: () => getDriverAccount(id),
    enabled: isEnabled && id.length > 0,
    staleTime: 0,
    // Read when a form opens, not every time the window regains focus: it is a master-key
    // cloud call returning the whole row.
    refetchOnWindowFocus: false,
  });
}

/** A driver's orders in one period, newest first, with the money on them. */
export function useDriverDeliveries(id: string, range: DateRange, region: string) {
  return useQuery({
    queryKey: queryKeys.drivers.deliveries(id, range, region),
    queryFn: () => listDriverDeliveries(id, range, region),
    placeholderData: keepPreviousData,
    enabled: id.length > 0,
  });
}

/**
 * Settled rather than success, as everywhere else in this console: a refusal usually means
 * the screen was behind, and re-reading is how it catches up.
 */
function useInvalidateDrivers() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all });
}

export function useCreateDriver() {
  const invalidate = useInvalidateDrivers();
  return useMutation({
    mutationFn: (params: DriverParams) => createDriver(params),
    onSettled: invalidate,
  });
}

export type DriverWrite = { id: string; pinnedRegion: string };

export function useUpdateDriver() {
  const invalidate = useInvalidateDrivers();
  return useMutation({
    mutationFn: ({ id, params, pinnedRegion }: DriverWrite & { params: DriverParams }) =>
      updateDriver(id, params, pinnedRegion),
    onSettled: invalidate,
  });
}

export function useResetDriverPassword() {
  const invalidate = useInvalidateDrivers();
  return useMutation({
    mutationFn: ({ id, password, pinnedRegion }: DriverWrite & { password: string }) =>
      resetDriverPassword(id, password, pinnedRegion),
    onSettled: invalidate,
  });
}

/**
 * Activating or deactivating reaches past the Drivers screen: a deactivated driver leaves
 * the map's online list and their queue is emptied, so both are re-read too.
 */
export function useSetDriverEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled, pinnedRegion }: DriverWrite & { enabled: boolean }) =>
      setDriverEnabled(id, enabled, pinnedRegion),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.drivers.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.dispatch.all });
      void queryClient.invalidateQueries({ queryKey: queryKeys.queue.all });
    },
  });
}

/** A push changes nothing any screen reads, so nothing is re-read after it. */
export function useMessageDriver() {
  return useMutation({
    mutationFn: ({ id, title, body }: { id: string; title: string; body: string }) => messageDriver(id, title, body),
  });
}
