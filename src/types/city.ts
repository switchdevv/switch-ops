import type { ParseObjectJSON, ParsePolygonJSON } from './parse';

/** Currency codes stored on `City.currency`, with the symbols the RN apps render them
 * with (switch-driver/src/localization/langs/*.json → `currency`). */
export type CurrencyCode = 'dzd' | 'usd' | 'eur';

/**
 * The `City` class — a delivery region. Only the fields this console reads are modeled:
 * `name` for the region filter, `currency` for every money figure on an order, and the
 * service area the live map outlines and frames itself on.
 *
 * `fees` (the per-city service fee, see switch-food/src/screens/Cart/Checkout.js:142) is
 * deliberately left out — the fee charged is already baked into each order's
 * `options.service`, and reading it from the city would only invite recomputing a number
 * the order already carries.
 */
export type City = ParseObjectJSON & {
  name?: string;
  currency?: CurrencyCode;
  /** The service area, drawn point by point on switch-dashboard's Regions page. The
   * customer app assigns an address to whichever region's polygon contains it
   * (switch-food/src/screens/ChooseLocation/ChooseLocation.js), so this outline is
   * literally where the region's orders can come from. */
  geofence?: ParsePolygonJSON;
  /** The zoom level the dashboard's region editor opens at. */
  zoom?: number;
};
