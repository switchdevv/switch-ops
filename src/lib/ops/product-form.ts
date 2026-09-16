import type { Product, SupplementGroup } from '@/types/restaurant';
import { parseAmount } from './order-edit';

/**
 * The dish form's rules, free of React and Parse.
 *
 * Transcribed from switch-dashboard's Products page (src/pages/Products/Products.jsx): a
 * name and a whole price are required, a discount must be below the price, and a
 * supplement group covers a run of supplements with an optional minimum and maximum pick.
 * What the customer app does with each is cited where it matters.
 *
 * Supplement groups are edited as "supplements 1 to 4" rather than as the stored
 * zero-based `from` / exclusive `to` — the numbers the list next to them shows.
 */

export type SupplementDraft = { id: string; name: string; cost: string };

export type GroupDraft = {
  /** A React key only; groups have no id of their own on the row. */
  key: string;
  name: string;
  /** 1-based and inclusive, as the supplement list is numbered on screen. */
  first: string;
  last: string;
  min: string;
  max: string;
};

export type VariantOptionDraft = { key: string; name: string; cost: string };
export type VariantDraft = { id: string; name: string; options: VariantOptionDraft[] };

export type ProductDraft = {
  name: string;
  description: string;
  price: string;
  discountPrice: string;
  enabled: boolean;
  supplements: SupplementDraft[];
  groups: GroupDraft[];
  variants: VariantDraft[];
};

/**
 * The dashboard's id for a supplement or a variant: eight random digits. The customer's
 * basket refers to supplements by it, so an existing one is never re-minted.
 */
export function newOptionId(): string {
  const digits = Array.from(crypto.getRandomValues(new Uint8Array(8)), (byte) => byte % 10).join('');
  return digits;
}

let rowKeyCounter = 0;

/**
 * A key for a row that has no id of its own. A counter rather than `crypto.randomUUID()`,
 * which only exists in a secure context — and this console is opened over plain http on a
 * LAN address often enough (see components/ui/copy-value.tsx).
 */
export function newRowKey(): string {
  rowKeyCounter += 1;
  return `row-${rowKeyCounter}`;
}

function amountText(value: number | '' | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : '';
}

export function emptyProductDraft(): ProductDraft {
  return {
    name: '',
    description: '',
    price: '',
    discountPrice: '',
    enabled: true,
    supplements: [],
    groups: [],
    variants: [],
  };
}

export function draftFromProduct(product: Product): ProductDraft {
  const supplements = (product.instructions ?? []).map((item) => ({
    id: item.id || newOptionId(),
    name: item.name ?? '',
    cost: amountText(item.cost),
  }));
  const count = supplements.length;

  return {
    name: product.name ?? '',
    description: product.description ?? '',
    price: amountText(product.price),
    // 0 is the row's "no discount", and shows as an empty box.
    discountPrice: product.discountPrice ? String(product.discountPrice) : '',
    enabled: product.enabled !== false,
    supplements,
    // Clamped the way the customer app reads them (`from >= 0`, `to <= length`), so a group
    // left pointing past the end by an earlier edit opens as what customers actually see.
    groups: (product.headers ?? []).map((group) => {
      const from = Math.max(0, Math.floor(Number(group.from) || 0));
      const to = Math.min(count, Math.floor(Number(group.to) || 0));
      return {
        key: newRowKey(),
        name: group.name ?? '',
        first: String(from + 1),
        last: String(Math.max(to, from + 1)),
        min: amountText(group.min),
        max: amountText(group.max),
      };
    }),
    variants: (product.variants ?? []).map((variant) => ({
      id: variant.id || newOptionId(),
      name: variant.name ?? '',
      options: (variant.values ?? []).map((value) => ({
        key: newRowKey(),
        name: value.name ?? '',
        cost: amountText(value.cost),
      })),
    })),
  };
}

/**
 * A problem, as a path to the field it belongs to: `name`, `price`, `discount`,
 * `supplement.2.cost`, `group.0.range`, `variant.1.options`, `variant.1.option.0.name`.
 */
export type ProductProblem = string;

export function validateProductDraft(draft: ProductDraft): Set<ProductProblem> {
  const problems = new Set<ProductProblem>();
  if (!draft.name.trim()) problems.add('name');

  const price = parseAmount(draft.price);
  if (price === null || price <= 0) problems.add('price');
  if (draft.discountPrice.trim()) {
    const discount = parseAmount(draft.discountPrice);
    if (discount === null || (price !== null && discount >= price)) problems.add('discount');
  }

  draft.supplements.forEach((item, index) => {
    if (!item.name.trim()) problems.add(`supplement.${index}.name`);
    if (parseAmount(item.cost) === null) problems.add(`supplement.${index}.cost`);
  });

  const count = draft.supplements.length;
  draft.groups.forEach((group, index) => {
    if (!group.name.trim()) problems.add(`group.${index}.name`);
    const first = parseAmount(group.first);
    const last = parseAmount(group.last);
    if (first === null || last === null || first < 1 || last > count || first > last) {
      problems.add(`group.${index}.range`);
    }
    const min = group.min.trim() ? parseAmount(group.min) : 0;
    const max = group.max.trim() ? parseAmount(group.max) : 0;
    if (min === null) problems.add(`group.${index}.min`);
    if (max === null) problems.add(`group.${index}.max`);
    if (min && max && min > max) problems.add(`group.${index}.max`);
  });

  draft.variants.forEach((variant, index) => {
    if (!variant.name.trim()) problems.add(`variant.${index}.name`);
    if (variant.options.length === 0) problems.add(`variant.${index}.options`);
    variant.options.forEach((option, optionIndex) => {
      if (!option.name.trim()) problems.add(`variant.${index}.option.${optionIndex}.name`);
      if (parseAmount(option.cost) === null) problems.add(`variant.${index}.option.${optionIndex}.cost`);
    });
  });

  return problems;
}

/**
 * Supplement numbers (1-based) no group covers. Once a dish has a group, the customer app
 * lists supplements only under their groups (switch-food/src/screens/Food/Food.js), so
 * these can't be ordered at all.
 */
export function uncoveredSupplements(draft: ProductDraft): number[] {
  if (draft.groups.length === 0) return [];
  const covered = new Set<number>();
  for (const group of draft.groups) {
    const first = parseAmount(group.first);
    const last = parseAmount(group.last);
    if (first === null || last === null) continue;
    for (let number = first; number <= last; number += 1) covered.add(number);
  }
  return draft.supplements.map((_, index) => index + 1).filter((number) => !covered.has(number));
}

export type ProductFields = Record<string, unknown>;

/** The columns a validated draft writes, in the shape the dashboard stores them. */
export function productFields(draft: ProductDraft): ProductFields {
  const price = parseAmount(draft.price) ?? 0;
  const discountPrice = parseAmount(draft.discountPrice) ?? 0;

  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    price,
    discountPrice,
    isDiscount: discountPrice > 0 && discountPrice < price,
    enabled: draft.enabled,
    instructions: draft.supplements.map((item) => ({
      id: item.id,
      name: item.name.trim(),
      cost: parseAmount(item.cost) ?? 0,
    })),
    headers: draft.groups.map(
      (group): SupplementGroup => ({
        name: group.name.trim(),
        from: (parseAmount(group.first) ?? 1) - 1,
        to: parseAmount(group.last) ?? 0,
        // Null for "no limit" — the customer app only checks a truthy one.
        min: parseAmount(group.min) || null,
        max: parseAmount(group.max) || null,
      }),
    ),
    variants: draft.variants.map((variant) => ({
      id: variant.id,
      name: variant.name.trim(),
      values: variant.options.map((option) => ({
        name: option.name.trim(),
        cost: parseAmount(option.cost) ?? 0,
      })),
    })),
  };
}

/** Only the columns that differ from the dish as it was loaded — the manager app edits
 * dishes too. See `changedRestaurantFields`. */
export function changedProductFields(next: ProductFields, previous: ProductFields): ProductFields {
  const changed: ProductFields = {};
  for (const [key, value] of Object.entries(next)) {
    if (JSON.stringify(value) !== JSON.stringify(previous[key])) changed[key] = value;
  }
  return changed;
}
