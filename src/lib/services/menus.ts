import { runFunction } from '@/lib/parse/cloud';
import { createObject } from '@/lib/parse/objects';
import { count, find, findOne, findWithCount, pointer, type PageResult, type QueryParam } from '@/lib/parse/query';
import type { MenuFilters } from '@/lib/url/restaurant-filters';
import type { Menu, MenuRow, MenuWithRestaurant, Product } from '@/types/restaurant';
import { deleteProductsWhere } from './products';

const LIST = 'List';

export const MENU_PAGE_SIZE = 25;

/**
 * A restaurant's menus (`List`), as switch-dashboard's Lists page manages them
 * (src/pages/Lists/Lists.jsx): created with a plain save, changed through `editList`, and
 * handed to the restaurant's manager with `assignList` after both.
 */

function listParams(restaurantId: string, filters: MenuFilters): QueryParam[] {
  return [
    { equalTo: { key: 'restaurant', value: pointer('Restaurant', restaurantId) } },
    filters.query ? { matches: { key: 'name', value: filters.query, modifiers: 'i' } } : {},
    filters.status === 'enabled' ? { equalTo: { key: 'enabled', value: true } } : {},
    filters.status === 'disabled' ? { notEqualTo: { key: 'enabled', value: true } } : {},
  ];
}

/**
 * One page of a restaurant's menus, with each menu's dish count.
 *
 * Most recently changed first — the order the customer app shows its tabs in
 * (switch-food/src/screens/Restaurant/Restaurant.js sorts on `updatedAt`), so the list here
 * reads the way the restaurant page does. The counts are one `count` per row, run together;
 * a page holds at most 25 and counts never serialise a row.
 */
export async function listMenus(restaurantId: string, filters: MenuFilters, page: number): Promise<PageResult<MenuRow>> {
  const result = await findWithCount<Menu>(LIST, [
    ...listParams(restaurantId, filters),
    { descending: 'updatedAt' },
    // A tiebreak: switching a restaurant's menus on or off rewrites them all in one go, and
    // rows with the same `updatedAt` could otherwise swap pages between reads.
    { addAscending: 'objectId' },
    { limit: MENU_PAGE_SIZE },
    { skip: (page - 1) * MENU_PAGE_SIZE },
  ]);
  const counts = await Promise.all(
    result.results.map((menu) => count('Food', [{ equalTo: { key: 'list', value: pointer(LIST, menu.objectId) } }])),
  );
  return {
    count: result.count,
    results: result.results.map((menu, index) => ({ ...menu, productCount: counts[index] })),
  };
}

/** A menu with its restaurant and that restaurant's region — the products page's header
 * and its region check. */
export function getMenu(id: string): Promise<MenuWithRestaurant | null> {
  return findOne<MenuWithRestaurant>(LIST, [
    { equalTo: { key: 'objectId', value: id } },
    { include: 'restaurant' },
    { include: 'restaurant.city' },
  ]);
}

export async function createMenu({
  restaurantId,
  name,
  enabled,
}: {
  restaurantId: string;
  name: string;
  enabled: boolean;
}): Promise<string> {
  const id = await createObject(
    LIST,
    { name, enabled, restaurant: pointer('Restaurant', restaurantId) },
    { publicRead: true },
  );
  await runFunction('assignList', { id, restaurantId });
  return id;
}

export async function renameMenu({ id, restaurantId, name }: { id: string; restaurantId: string; name: string }) {
  await runFunction('editList', { id, name });
  await runFunction('assignList', { id, restaurantId });
}

/**
 * Switches a menu on or off, and every dish in it with it — the dashboard's
 * enable/disable, which does both. Dishes already in the state asked for are skipped,
 * one `editProduct` each for the rest, in turn.
 */
export async function setMenuEnabled(id: string, enabled: boolean): Promise<void> {
  await runFunction('editList', { id, enabled });
  const dishes = await find<Pick<Product, 'objectId' | 'enabled'>>('Food', [
    { equalTo: { key: 'list', value: pointer(LIST, id) } },
    { select: ['enabled'] },
    { limit: 1000 },
  ]);
  for (const dish of dishes) {
    if ((dish.enabled === true) !== enabled) await runFunction('editProduct', { id: dish.objectId, enabled });
  }
}

/**
 * Deletes a menu and every dish in it. `deletelists` deletes the menu alone, and a dish
 * whose menu is gone still shows in the customer app's "All" tab with nowhere to edit it
 * from — so the dishes go first, and the menu only once they are gone.
 */
export async function deleteMenu(id: string): Promise<void> {
  await deleteProductsWhere({ equalTo: { key: 'list', value: pointer(LIST, id) } });
  await runFunction('deletelists', { ids: [id] });
}
