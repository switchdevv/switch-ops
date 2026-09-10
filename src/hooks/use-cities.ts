'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { listCities } from '@/lib/services/cities';

/** The region list behind the filter. Regions change about once a quarter, so this is
 * cached for the tab's lifetime rather than joining the board's refresh cycle. */
export function useCities() {
  return useQuery({
    queryKey: queryKeys.cities.list(),
    queryFn: listCities,
    staleTime: Infinity,
  });
}
