'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAccess } from '@/hooks/use-access';
import { useSession } from '@/hooks/use-session';
import { pinnedRegionId } from '@/lib/auth/access';
import type { CustomerParams } from '@/lib/ops/customer-form';
import { queryKeys } from '@/lib/query/keys';
import {
  createCustomer,
  deleteCustomer,
  getCustomerAccount,
  getCustomerOrderStats,
  listCustomerAddresses,
  listCustomerOrders,
  listCustomers,
  resetCustomerPassword,
  setCustomerEnabled,
  updateCustomer,
  type Actor,
} from '@/lib/services/customers';
import type { CustomerFilters } from '@/lib/url/customer-filters';

/**
 * Customer accounts change when ops change them, so nothing here polls; a write re-reads
 * what it could have touched instead (see `useInvalidateCustomers`).
 */

/** Who is acting, as every write's guard needs it. */
export function useActor(): Actor {
  const { role, region } = useAccess();
  const { data: user } = useSession();
  return { role, selfId: user?.id, pinnedRegion: pinnedRegionId(region) };
}

export function useCustomers(filters: CustomerFilters, page: number, hideStaff: boolean, isEnabled = true) {
  return useQuery({
    queryKey: queryKeys.customers.list(filters, page, hideStaff),
    queryFn: () => listCustomers(filters, page, hideStaff),
    placeholderData: keepPreviousData,
    enabled: isEnabled,
  });
}

export function useCustomerAccount(id: string) {
  return useQuery({
    queryKey: queryKeys.customers.account(id),
    queryFn: () => getCustomerAccount(id),
    enabled: id.length > 0,
  });
}

export function useCustomerAddresses(id: string, isEnabled: boolean) {
  return useQuery({
    queryKey: queryKeys.customers.addresses(id),
    queryFn: () => listCustomerAddresses(id),
    enabled: isEnabled && id.length > 0,
  });
}

export function useCustomerOrders(id: string, page: number, region: string, isEnabled: boolean) {
  return useQuery({
    queryKey: queryKeys.orders.customer(id, page, region),
    queryFn: () => listCustomerOrders(id, page, region),
    placeholderData: keepPreviousData,
    enabled: isEnabled && id.length > 0,
  });
}

export function useCustomerOrderStats(id: string, region: string, isEnabled: boolean) {
  return useQuery({
    queryKey: queryKeys.orders.customerStats(id, region),
    queryFn: () => getCustomerOrderStats(id, region),
    enabled: isEnabled && id.length > 0,
  });
}

/**
 * Everything an account write can reach: the customer lists and pages, and — because
 * disabling an account that runs a restaurant switches the restaurant and its dishes too —
 * the catalogue. Settled rather than success: a refusal usually means the screen was behind.
 */
function useInvalidateCustomers() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.restaurants.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
  };
}

export function useCreateCustomer() {
  const actor = useActor();
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: (params: CustomerParams) => createCustomer(params, actor),
    onSettled: invalidate,
  });
}

export function useUpdateCustomer() {
  const actor = useActor();
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, params }: { id: string; params: CustomerParams }) => updateCustomer(id, params, actor),
    onSettled: invalidate,
  });
}

export function useResetCustomerPassword() {
  const actor = useActor();
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => resetCustomerPassword(id, password, actor),
    onSettled: invalidate,
  });
}

export function useSetCustomerEnabled() {
  const actor = useActor();
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => setCustomerEnabled(id, enabled, actor),
    onSettled: invalidate,
  });
}

export function useDeleteCustomer() {
  const actor = useActor();
  const invalidate = useInvalidateCustomers();
  return useMutation({
    mutationFn: (id: string) => deleteCustomer(id, actor),
    onSettled: invalidate,
  });
}
