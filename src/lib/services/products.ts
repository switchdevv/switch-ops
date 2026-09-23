import type { PreparedImage } from '@/lib/media/image';
import { runFunction } from '@/lib/parse/cloud';
import { deleteStoredFile, uploadImage } from '@/lib/parse/files';
import { createObject } from '@/lib/parse/objects';
import { find, findOne, findWithCount, pointer, type PageResult, type QueryParam } from '@/lib/parse/query';
import { getParse } from '@/lib/parse/client';
import type { ProductFields } from '@/lib/ops/product-form';
import type { ProductFilters } from '@/lib/url/restaurant-filters';
import type { Product } from '@/types/restaurant';

const FOOD = 'Food';

export const PRODUCT_PAGE_SIZE = 25;

/**
 * Dishes (`Food`). Created with a plain save and changed through `editProduct`, as
 * switch-dashboard's Products page does: a dish is readable by everyone but writable only
 * by whoever created it until `assignProduct` hands it to the restaurant's manager, so a
 * plain save from a second staff account would be refused.
 */

function listParams(filters: ProductFilters): QueryParam[] {
  const { query, field, status } = filters;
  return [
    query && field === 'name' ? { matches: { key: 'name', value: query, modifiers: 'i' } } : {},
    query && field === 'objectId' ? { startsWith: { key: 'objectId', value: query } } : {},
    status === 'enabled' ? { equalTo: { key: 'enabled', value: true } } : {},
    status === 'disabled' ? { notEqualTo: { key: 'enabled', value: true } } : {},
  ];
}

/**
 * One page of a menu's dishes, in the order the customer app lists them
 * (switch-food/src/screens/Restaurant/Restaurant.js): switched-on dishes first, newest
 * first within each.
 */
export function listProducts(menuId: string, filters: ProductFilters, page: number): Promise<PageResult<Product>> {
  return findWithCount<Product>(FOOD, [
    { equalTo: { key: 'list', value: pointer('List', menuId) } },
    ...listParams(filters),
    { descending: 'enabled' },
    { addDescending: 'createdAt' },
    // A tiebreak: an imported menu's dishes can share a `createdAt`, and without one they
    // could repeat on one page and be missing from the next.
    { addAscending: 'objectId' },
    { limit: PRODUCT_PAGE_SIZE },
    { skip: (page - 1) * PRODUCT_PAGE_SIZE },
  ]);
}

export function getProduct(id: string): Promise<Product | null> {
  return findOne<Product>(FOOD, [{ equalTo: { key: 'objectId', value: id } }]);
}

/** The supplement names the dashboard's form suggests, from the platform config
 * (`supplementsAutoComplete`, edited on the dashboard's Configs page). */
export async function getSupplementSuggestions(): Promise<string[]> {
  const config = await getParse().Config.get();
  const value: unknown = config.get('supplementsAutoComplete');
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

/* ---- saving -------------------------------------------------------------------- */

export type ProductPlace = { menuId: string; restaurantId: string; regionId: string };

/**
 * Creates a dish in a menu and returns its id, then `assignProduct` gives it to the
 * restaurant's manager (a no-op when it has none).
 */
export async function createProduct({
  place,
  fields,
  picture,
}: {
  place: ProductPlace;
  fields: ProductFields;
  picture: PreparedImage | null;
}): Promise<string> {
  const file = picture ? await uploadImage(picture.fileName, picture.dataUrl) : null;
  const id = await createObject(
    FOOD,
    {
      ...fields,
      ...(file ? { picture: file } : {}),
      city: pointer('City', place.regionId),
      restaurant: pointer('Restaurant', place.restaurantId),
      list: pointer('List', place.menuId),
    },
    { publicRead: true },
  );
  await runFunction('assignProduct', { id, restaurantId: place.restaurantId });
  return id;
}

/**
 * Saves the changed columns of a dish through `editProduct`, then re-runs `assignProduct`
 * so a new picture belongs to the manager, then deletes the picture it replaced.
 */
export async function updateProduct({
  id,
  restaurantId,
  fields,
  picture,
  previousPicture,
}: {
  id: string;
  restaurantId: string;
  fields: ProductFields;
  picture: PreparedImage | null;
  previousPicture: string | null;
}): Promise<void> {
  const file = picture ? await uploadImage(picture.fileName, picture.dataUrl) : null;
  const body = file ? { ...fields, picture: file } : fields;
  if (Object.keys(body).length === 0) return;

  await runFunction('editProduct', { id, ...body });
  if (file) {
    await runFunction('assignProduct', { id, restaurantId }).catch(logFollowUp);
    if (previousPicture) await deleteStoredFile(previousPicture).catch(logFollowUp);
  }
}

function logFollowUp(error: unknown) {
  if (process.env.NODE_ENV !== 'production') console.error('[products] follow-up', error);
}

export async function setProductEnabled(id: string, enabled: boolean): Promise<void> {
  await runFunction('editProduct', { id, enabled });
}

/**
 * Copies a dish into the same menu through `duplicateProduct`. The copy has no picture —
 * the function leaves it out, so two dishes never share one stored file — and the function
 * doesn't return the copy's id.
 */
export async function duplicateProduct(id: string): Promise<void> {
  await runFunction('duplicateProduct', { id });
}

export async function deleteProduct(id: string): Promise<void> {
  await runFunction('deleteProducts', { ids: [id] });
}

/** Parse's `find` ceiling, and a batch size `deleteProducts` gets through in one call. */
const BATCH = 100;

/**
 * Deletes every dish matching one constraint (a menu, or a restaurant), with their
 * pictures, through `deleteProducts` in batches. Neither `deletelists` nor `deleteStores`
 * deletes dishes, and one left behind still turns up in the customer app's "All" tab and
 * search.
 */
export async function deleteProductsWhere(constraint: QueryParam): Promise<void> {
  // Bounded, so a batch the server acknowledged without deleting can't loop forever —
  // 50 batches is 5,000 dishes, far past any real menu.
  for (let round = 0; round < 50; round += 1) {
    const batch = await find<Pick<Product, 'objectId'>>(FOOD, [constraint, { select: ['objectId'] }, { limit: BATCH }]);
    if (batch.length === 0) return;
    await runFunction('deleteProducts', { ids: batch.map((row) => row.objectId) });
    if (batch.length < BATCH) return;
  }
}
