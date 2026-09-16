'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { duplicateRestaurant } from '@/lib/services/duplicate';
import {
  assignRestaurantManager,
  createRestaurant,
  deleteRestaurant,
  getManagerCandidate,
  getRestaurant,
  getRestaurantName,
  listCategories,
  listRestaurants,
  setRestaurantActive,
  setRestaurantEnabled,
  updateRestaurant,
  type CreateRestaurantInput,
  type UpdateRestaurantInput,
} from '@/lib/services/restaurants';
import type { RestaurantFilters } from '@/lib/url/restaurant-filters';

/**
 * The catalogue changes slowly and nobody watches it live, so none of these poll. A write
 * re-reads what it could have touched instead — see `useInvalidateCatalogue`.
 */

export function useRestaurants(filters: RestaurantFilters, page: number, isEnabled = true) {
  return useQuery({
    queryKey: queryKeys.restaurants.list(filters, page),
    queryFn: () => listRestaurants(filters, page),
    placeholderData: keepPreviousData,
    enabled: isEnabled,
  });
}

export function useRestaurant(id: string) {
  return useQuery({
    queryKey: queryKeys.restaurants.detail(id),
    queryFn: () => getRestaurant(id),
    enabled: id.length > 0,
  });
}

export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: listCategories,
    staleTime: Infinity,
  });
}

/**
 * Everything a catalogue write can reach. Switching a restaurant off cascades to its menus
 * and dishes, and its Pause and hours show on the orders board and the live map — so a
 * write re-reads all of them. The Managers screen too: it shows each manager's restaurant,
 * and `toggleEnableStores`, `assignManager` and `deleteStores` all rewrite manager accounts.
 * Settled rather than success: a refusal usually means the screen was behind.
 */
export function useInvalidateCatalogue() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.managers.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.restaurants.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.menus.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.products.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dispatch.all });
  };
}

export function useCreateRestaurant() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (input: CreateRestaurantInput) => createRestaurant(input),
    onSettled: invalidate,
  });
}

export function useUpdateRestaurant() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (input: UpdateRestaurantInput) => updateRestaurant(input),
    onSettled: invalidate,
  });
}

export function useSetRestaurantActive() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => setRestaurantActive(id, active),
    onSettled: invalidate,
  });
}

export function useSetRestaurantEnabled() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => setRestaurantEnabled(id, enabled),
    onSettled: invalidate,
  });
}

/** Copies a restaurant with its menus and products; see lib/services/duplicate.ts. */
export function useDuplicateRestaurant() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({ mutationFn: duplicateRestaurant, onSettled: invalidate });
}

export function useDeleteRestaurant() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: (id: string) => deleteRestaurant(id),
    onSettled: invalidate,
  });
}

export function useAssignManager() {
  const invalidate = useInvalidateCatalogue();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ restaurantId, managerId }: { restaurantId: string; managerId: string | null }) =>
      assignRestaurantManager(restaurantId, managerId),
    onSettled: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: ['manager-candidate'] });
    },
  });
}

/** The account behind a typed-in id, and the restaurant it already runs, if any. */
export function useManagerCandidate(userId: string) {
  return useQuery({
    queryKey: queryKeys.managerCandidate(userId),
    queryFn: async () => {
      const candidate = await getManagerCandidate(userId);
      const storeId = candidate?.managerStore?.objectId;
      const storeName = storeId ? await getRestaurantName(storeId) : null;
      return candidate ? { candidate, storeId: storeId ?? null, storeName } : null;
    },
    enabled: userId.length > 0,
    retry: false,
  });
}
