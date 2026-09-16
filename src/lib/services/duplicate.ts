import { downloadImage } from '@/lib/media/image';
import { runFunction } from '@/lib/parse/cloud';
import { COPY_SOURCE_MISSING } from '@/lib/parse/errors';
import { uploadImage } from '@/lib/parse/files';
import { createObject } from '@/lib/parse/objects';
import { find, findOne, pointer } from '@/lib/parse/query';
import type { ParseFileJSON } from '@/types/parse';
import type { Menu, Product, Restaurant } from '@/types/restaurant';

/**
 * Copying a menu, or a whole restaurant with its menus and products.
 *
 * The platform has no cloud function for either — only `duplicateProduct`, which copies one
 * dish — so a copy is built from the same plain saves ops uses to create these rows, with
 * the same ACLs.
 *
 * - **Pictures are copied as new files**, never shared: deleting a dish deletes its
 *   picture's file (`deleteProducts`), and so does replacing it, so two rows pointing at one
 *   file would lose it together. A picture that can't be copied — the storage CDN refusing
 *   the browser's download — leaves that row without one and is counted, not fatal.
 * - **Order is kept.** The customer app lists menus newest-changed first and dishes newest
 *   first, so rows are created oldest first.
 * - **A copy that stops half-way is left as it is** and reported with its id
 *   (`PartialCopyError`), so ops can finish or delete it; nothing is rolled back behind
 *   their back.
 */

export type CopyProgress = { done: number; total: number };

export type CopyResult = {
  /** The new menu's or restaurant's id. */
  id: string;
  menus: number;
  products: number;
  /** Pictures that couldn't be copied, so the copied rows have none. */
  picturesMissed: number;
};

/** A copy that failed after its first row was created. */
export class PartialCopyError extends Error {
  constructor(
    readonly copyId: string,
    readonly reason: unknown,
  ) {
    super('PARTIAL_COPY');
  }
}

/** Parallel picture copies per batch — enough to be quick without flooding the upload. */
const BATCH = 4;

const PRODUCT_FIELDS = [
  'name',
  'description',
  'price',
  'discountPrice',
  'isDiscount',
  'enabled',
  'instructions',
  'headers',
  'variants',
] as const;

type Counter = { picturesMissed: number };

async function copyPicture(file: ParseFileJSON | undefined, counter: Counter): Promise<ParseFileJSON | null> {
  if (!file?.url) return null;
  try {
    const image = await downloadImage(file.url);
    return await uploadImage(image.fileName, image.dataUrl);
  } catch {
    counter.picturesMissed += 1;
    return null;
  }
}

function pick<T extends object>(row: T, keys: readonly (keyof T)[]): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const key of keys) if (row[key] !== undefined) fields[key as string] = row[key];
  return fields;
}

function menuProducts(menuId: string): Promise<Product[]> {
  return find<Product>('Food', [
    { equalTo: { key: 'list', value: pointer('List', menuId) } },
    { ascending: 'createdAt' },
    { limit: 1000 },
  ]);
}

/**
 * Creates copies of `products` in a menu, a batch at a time: the batch's pictures in
 * parallel, then its rows one by one, so their creation order matches the source's.
 */
async function copyProducts({
  products,
  menuId,
  restaurantId,
  regionId,
  assignToManager,
  counter,
  onCopied,
}: {
  products: Product[];
  menuId: string;
  restaurantId: string;
  regionId: string;
  /** Hand each copy to the restaurant's manager, as creating a dish does. */
  assignToManager: boolean;
  counter: Counter;
  onCopied: () => void;
}): Promise<void> {
  for (let start = 0; start < products.length; start += BATCH) {
    const batch = products.slice(start, start + BATCH);
    const pictures = await Promise.all(batch.map((product) => copyPicture(product.picture, counter)));
    for (const [index, product] of batch.entries()) {
      const picture = pictures[index];
      const id = await createObject(
        'Food',
        {
          ...pick(product, PRODUCT_FIELDS),
          ...(picture ? { picture } : {}),
          city: pointer('City', regionId),
          restaurant: pointer('Restaurant', restaurantId),
          list: pointer('List', menuId),
        },
        { publicRead: true },
      );
      if (assignToManager) await runFunction('assignProduct', { id, restaurantId });
      onCopied();
    }
  }
}

/**
 * Copies a menu and its products into the same restaurant under a new name.
 *
 * The copy is created switched off and switched to the source's state only once every
 * product is in, so a customer never opens a half-filled tab.
 */
export async function duplicateMenu({
  menuId,
  name,
  onProgress,
}: {
  menuId: string;
  name: string;
  onProgress: (progress: CopyProgress) => void;
}): Promise<CopyResult> {
  const source = await findOne<Menu & { restaurant?: Restaurant & { objectId: string; city?: { objectId: string } } }>(
    'List',
    [{ equalTo: { key: 'objectId', value: menuId } }, { include: 'restaurant' }],
  );
  const restaurantId = source?.restaurant?.objectId;
  const regionId = source?.restaurant?.city?.objectId;
  if (!source || !restaurantId || !regionId) throw new Error(COPY_SOURCE_MISSING);

  const products = await menuProducts(menuId);
  const counter: Counter = { picturesMissed: 0 };
  let done = 0;
  onProgress({ done, total: products.length });

  const copyId = await createObject(
    'List',
    { name, enabled: false, restaurant: pointer('Restaurant', restaurantId) },
    { publicRead: true },
  );

  try {
    await runFunction('assignList', { id: copyId, restaurantId });
    await copyProducts({
      products,
      menuId: copyId,
      restaurantId,
      regionId,
      assignToManager: true,
      counter,
      onCopied: () => {
        done += 1;
        onProgress({ done, total: products.length });
      },
    });
    if (source.enabled === true) await runFunction('editList', { id: copyId, enabled: true });
  } catch (reason) {
    throw new PartialCopyError(copyId, reason);
  }

  return { id: copyId, menus: 1, products: products.length, picturesMissed: counter.picturesMissed };
}

const RESTAURANT_FIELDS = [
  'description',
  'address',
  'phone',
  'location',
  'openTime',
  'closeTime',
  'pauseStart',
  'pauseEnd',
  'workingDays',
  'isFeatured',
  'active',
  'fee',
] as const;

/**
 * Copies a restaurant — its details, hours, categories, commission, picture, and every menu
 * with its products — into `regionId` under a new name.
 *
 * The copy starts **disabled**: it has the same address and pin as the original and no
 * manager, and customers shouldn't find a second identical restaurant before ops has
 * checked it. Not copied: the manager (an account runs one restaurant), promos, reviews,
 * and the rating and order counters, which start from zero.
 */
export async function duplicateRestaurant({
  restaurantId,
  name,
  regionId,
  onProgress,
}: {
  restaurantId: string;
  name: string;
  regionId: string;
  onProgress: (progress: CopyProgress) => void;
}): Promise<CopyResult> {
  const source = await findOne<Restaurant & { categories?: { objectId: string }[] }>('Restaurant', [
    { equalTo: { key: 'objectId', value: restaurantId } },
  ]);
  if (!source) throw new Error(COPY_SOURCE_MISSING);

  const menus = await find<Menu>('List', [
    { equalTo: { key: 'restaurant', value: pointer('Restaurant', restaurantId) } },
    { ascending: 'updatedAt' },
    { limit: 1000 },
  ]);
  const productsByMenu = await Promise.all(menus.map((menu) => menuProducts(menu.objectId)));
  const total = productsByMenu.reduce((sum, products) => sum + products.length, 0);

  const counter: Counter = { picturesMissed: 0 };
  let done = 0;
  onProgress({ done, total });

  const picture = await copyPicture(source.picture, counter);
  const copyId = await createObject(
    'Restaurant',
    {
      ...pick(source, RESTAURANT_FIELDS),
      name,
      searchName: name.toLowerCase(),
      enabled: false,
      city: pointer('City', regionId),
      // Included on no query here, so these are pointers already — rebuilt anyway, so a
      // stray full object can't reach the request body.
      categories: (source.categories ?? []).map((category) => pointer('Category', category.objectId)),
      ...(picture ? { picture } : {}),
    },
    { publicRead: true, role: 'Staff' },
  );

  try {
    for (const [index, menu] of menus.entries()) {
      const menuCopyId = await createObject(
        'List',
        { name: menu.name ?? '', enabled: menu.enabled === true, restaurant: pointer('Restaurant', copyId) },
        { publicRead: true },
      );
      await copyProducts({
        products: productsByMenu[index],
        menuId: menuCopyId,
        restaurantId: copyId,
        regionId,
        // A new restaurant has no manager to hand anything to.
        assignToManager: false,
        counter,
        onCopied: () => {
          done += 1;
          onProgress({ done, total });
        },
      });
    }
  } catch (reason) {
    throw new PartialCopyError(copyId, reason);
  }

  return { id: copyId, menus: menus.length, products: total, picturesMissed: counter.picturesMissed };
}
