import { find } from '@/lib/parse/query';
import type { City } from '@/types/city';

const COLLECTION = 'City';

/**
 * Every delivery region, for the region filter.
 *
 * Sorted by name rather than by `createdAt` (which is what switch-dashboard does):
 * a dispatcher looking for "Oran" scans alphabetically, and the order regions happened
 * to be created in is meaningful to nobody.
 */
export function listCities(): Promise<City[]> {
  return find<City>(COLLECTION, [{ ascending: 'name' }, { limit: 1000 }]);
}
