'use client';

import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useInvalidateCatalogue } from '@/hooks/use-restaurants';
import { queryKeys } from '@/lib/query/keys';
import { createMenu, deleteMenu, getMenu, listMenus, renameMenu, setMenuEnabled } from '@/lib/services/menus';
import { duplicateMenu } from '@/lib/services/duplicate';
import { listReviews } from '@/lib/services/reviews';
import type { MenuFilters, ReviewFilters } from '@/lib/url/restaurant-filters';

export function useMenus(restaurantId: string, filters: MenuFilters, page: number, isEnabled = true) {
  return useQuery({
    queryKey: queryKeys.menus.list(restaurantId, filters, page),
    queryFn: () => listMenus(restaurantId, filters, page),
    placeholderData: keepPreviousData,
    enabled: isEnabled && restaurantId.length > 0,
  });
}

export function useMenu(id: string) {
  return useQuery({
    queryKey: queryKeys.menus.detail(id),
    queryFn: () => getMenu(id),
    enabled: id.length > 0,
  });
}

export function useReviews(restaurantId: string, filters: ReviewFilters, page: number, isEnabled = true) {
  return useQuery({
    queryKey: queryKeys.reviews.list(restaurantId, filters, page),
    queryFn: () => listReviews(restaurantId, filters, page),
    placeholderData: keepPreviousData,
    enabled: isEnabled && restaurantId.length > 0,
  });
}

export function useCreateMenu() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({ mutationFn: createMenu, onSettled: invalidate });
}

export function useRenameMenu() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({ mutationFn: renameMenu, onSettled: invalidate });
}

export function useSetMenuEnabled() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => setMenuEnabled(id, enabled),
    onSettled: invalidate,
  });
}

/** Copies a menu with its products; see lib/services/duplicate.ts. */
export function useDuplicateMenu() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({ mutationFn: duplicateMenu, onSettled: invalidate });
}

export function useDeleteMenu() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({ mutationFn: (id: string) => deleteMenu(id), onSettled: invalidate });
}
