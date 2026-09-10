import type { DispatchSelection, EntityKind } from '@/lib/ops/dispatch';

/**
 * The live map's state that belongs in a link: the region being watched and the one
 * thing selected on it.
 *
 * Same reasoning as the board's filters (lib/url/order-filters.ts): a dispatcher who
 * pastes `/map?order=…` into the team chat should put the next person on the same order
 * with the same lines drawn, and the board's "Show on map" is nothing more than that
 * link. The selection is a *replace*, not a push — a shift of clicking around the map
 * would otherwise leave the Back button a hundred steps deep.
 */
export const DISPATCH_PARAM_KEYS = {
  region: 'region',
  order: 'order',
  driver: 'driver',
  restaurant: 'restaurant',
} as const;

export type DispatchParams = {
  /** City objectId, or '' for every region the account may see. */
  region: string;
  selection: DispatchSelection | null;
};

/** Checked in this order, so a hand-edited URL naming two things selects the first. */
const SELECTION_KINDS: EntityKind[] = ['order', 'driver', 'restaurant'];

/** Parse objectIds are short alphanumerics. Anything else in the URL was typed by hand
 * or truncated in a chat client, and is dropped rather than looked up. */
function isObjectId(value: string | null): value is string {
  return !!value && /^[A-Za-z0-9]{1,32}$/.test(value);
}

export function parseDispatchParams(params: URLSearchParams): DispatchParams {
  const region = params.get(DISPATCH_PARAM_KEYS.region);
  let selection: DispatchSelection | null = null;

  for (const kind of SELECTION_KINDS) {
    const id = params.get(DISPATCH_PARAM_KEYS[kind]);
    if (isObjectId(id)) {
      selection = { kind, id };
      break;
    }
  }

  return { region: isObjectId(region) ? region : '', selection };
}

/** Omits every default, like the board's own serializer, so a plain `/map` stays plain. */
export function serializeDispatchParams({ region, selection }: DispatchParams): string {
  const params = new URLSearchParams();
  if (region) params.set(DISPATCH_PARAM_KEYS.region, region);
  if (selection) params.set(DISPATCH_PARAM_KEYS[selection.kind], selection.id);
  const search = params.toString();
  return search ? `?${search}` : '';
}

/** The map, focused on one order — what the orders board links to. */
export function mapHrefForOrder(orderId: string): string {
  return `/map${serializeDispatchParams({ region: '', selection: { kind: 'order', id: orderId } })}`;
}
