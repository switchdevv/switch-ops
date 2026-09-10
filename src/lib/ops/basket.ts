import type { OrderRow } from '@/types/order';

/** One dish on an order, with its per-line detail already paired to it. */
export type BasketLine = {
  /** Stable across renders: the Food objectId, or the index when the dish is gone. */
  key: string;
  name: string | undefined;
  quantity: number;
  price: number | undefined;
  /** Chosen options — "Size: Large". */
  variants: { name: string; value: string }[];
  /** Paid extras, called "supplements" in the apps. */
  supplements: string[];
  note: string | undefined;
  /**
   * False when the `food` pointer resolved but `options.values` has no entry keyed by
   * its id — the line's own price, quantity and extras are then unknown. Surfaced
   * rather than skipped: a dispatcher reading out an order needs to know the list is
   * incomplete, not silently get a shorter one.
   */
  isResolved: boolean;
};

/**
 * Reads an order's basket.
 *
 * This is the one place that knows the backend's index-alignment convention: the
 * `food` pointer array and `options.values` are **parallel arrays**, and entry `i` of
 * `values` is an object keyed by `food[i].objectId`. Nothing in either shape says so —
 * it is a convention every reader has to be told about, and switch-dashboard, the RN
 * apps and this console each had to be. Encoding it once means a new screen gets a
 * plain array of lines and never learns the quirk at all.
 *
 * Iteration is driven by `food`, not by `values`: a dish deleted from the menu still
 * leaves its line behind, and a line with no dish has no name to show — so the array
 * that carries the names is the one that decides how many rows there are.
 */
export function readBasket(order: Pick<OrderRow, 'food' | 'options'>): BasketLine[] {
  const dishes = order.food ?? [];
  const values = order.options?.values ?? [];

  return dishes.map((dish, index) => {
    const line = values[index]?.[dish.objectId];

    return {
      key: dish.objectId || `line-${index}`,
      name: dish.name,
      // A line with no recorded quantity is one unit — that is how the apps' own
      // exports read it, and showing "×0" next to a real dish would be a lie.
      quantity: line?.quantity ?? 1,
      price: line?.price,
      variants: (line?.variants ?? [])
        .filter((variant) => variant.name && variant.value?.name)
        .map((variant) => ({ name: variant.name!, value: variant.value!.name! })),
      supplements: (line?.instructions ?? [])
        .map((instruction) => instruction.name)
        .filter((name): name is string => !!name),
      note: line?.note,
      isResolved: !!line,
    };
  });
}

/** Total units in the basket — the "3 items" on the collapsed row. */
export function basketSize(lines: BasketLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}
