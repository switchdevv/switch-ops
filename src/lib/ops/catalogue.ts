import type { Locale } from '@/lib/i18n/locales';
import type { Category, RestaurantRow } from '@/types/restaurant';
import { restaurantHours, type RestaurantHours, type WallClock } from './restaurant-hours';

/**
 * Small rules the catalogue screens share, free of React and Parse.
 */

/** A category in the console's language: its translation, else the English one, else the
 * admin's own `name` — which is what a category deleted since only has, if anything. */
export function categoryName(category: Category, locale: Locale): string {
  return category.translations?.[locale] || category.translations?.en || category.name || category.objectId;
}

/**
 * What a customer finds right now, in one value: a restaurant taken off the platform first
 * (whatever its switch and hours say, it can't be found), else the checkout rule in
 * lib/ops/restaurant-hours.ts.
 */
export type RestaurantState = { state: 'disabled' } | RestaurantHours;

export function restaurantState(row: RestaurantRow, clock: WallClock): RestaurantState {
  if (row.enabled !== true) return { state: 'disabled' };
  // A cleared break is written as null here; the hours rule reads "unset" as undefined.
  return restaurantHours({ ...row, pauseStart: row.pauseStart ?? undefined, pauseEnd: row.pauseEnd ?? undefined }, clock);
}
