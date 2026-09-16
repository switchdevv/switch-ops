'use client';

import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useInvalidateCatalogue } from '@/hooks/use-restaurants';
import { queryKeys } from '@/lib/query/keys';
import {
  createProduct,
  deleteProduct,
  duplicateProduct,
  getProduct,
  getSupplementSuggestions,
  listProducts,
  setProductEnabled,
  updateProduct,
} from '@/lib/services/products';
import type { ProductFilters } from '@/lib/url/restaurant-filters';

export function useProducts(menuId: string, filters: ProductFilters, page: number) {
  return useQuery({
    queryKey: queryKeys.products.list(menuId, filters, page),
    queryFn: () => listProducts(menuId, filters, page),
    placeholderData: keepPreviousData,
    enabled: menuId.length > 0,
  });
}

export function useProduct(id: string) {
  return useQuery({
    queryKey: queryKeys.products.detail(id),
    queryFn: () => getProduct(id),
    enabled: id.length > 0,
    // A form is open on it; a background refetch must not swap the row it was loaded from.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** Suggestions only — a failure leaves the box without them, and says nothing. */
export function useSupplementSuggestions() {
  return useQuery({
    queryKey: queryKeys.products.suggestions(),
    queryFn: getSupplementSuggestions,
    staleTime: Infinity,
    retry: false,
  });
}

export function useCreateProduct() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({ mutationFn: createProduct, onSettled: invalidate });
}

export function useUpdateProduct() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({ mutationFn: updateProduct, onSettled: invalidate });
}

export function useSetProductEnabled() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) => setProductEnabled(id, enabled),
    onSettled: invalidate,
  });
}

export function useDuplicateProduct() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({ mutationFn: (id: string) => duplicateProduct(id), onSettled: invalidate });
}

export function useDeleteProduct() {
  const invalidate = useInvalidateCatalogue();
  return useMutation({ mutationFn: (id: string) => deleteProduct(id), onSettled: invalidate });
}
