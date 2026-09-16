import type { ClockTime } from '@/types/order';
import type { ParsePointer } from '@/types/parse';
import type { RestaurantRow } from '@/types/restaurant';
import { toLatLng, type LatLng } from './dispatch';

/**
 * The restaurant form's rules, free of React and Parse: what a draft holds, when it can be
 * saved, and which columns it writes.
 *
 * The required fields are switch-dashboard's (src/pages/Stores/Stores.jsx `itemAction`):
 * name, address, phone, a pin, a region, at least one working day and one category, and
 * the commission. Two hour rules are added, both the customer app's:
 *
 * - close must come after open. Checkout compares `open <= now < close` on the same day
 *   (switch-food/src/screens/Cart/Checkout.js), so 18:00–02:00 is closed around the clock,
 *   and the dashboard's "not equal" check lets exactly that through.
 * - a break sits inside the hours and ends after it starts; one that doesn't is either
 *   never applied or closes the kitchen for longer than whoever typed it meant.
 */

/**
 * The commission a restaurant created by a staff account starts on. Staff can't see or set
 * the rate (it is what switch-finance bills), and the schema won't create a restaurant
 * without one, so it starts at nothing and an admin sets the real rate — the admin views
 * flag a restaurant with no commission so it isn't forgotten.
 */
export const DEFAULT_COMMISSION_RATE = 0;

/** JavaScript weekday numbers, the numbering `workingDays` uses (0 = Sunday). */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export type RestaurantDraft = {
  name: string;
  description: string;
  address: string;
  phone: string;
  regionId: string;
  categoryIds: string[];
  location: LatLng | null;
  /** 'HH:MM', as `<input type="time">` reads and writes it whatever the locale shows. */
  openTime: string;
  closeTime: string;
  hasBreak: boolean;
  breakStart: string;
  breakEnd: string;
  workingDays: number[];
  isFeatured: boolean;
  /** Only written when creating — afterwards Pause and Enable are their own actions. */
  active: boolean;
  enabled: boolean;
  /** A percentage, as typed ('15', '12.5'). Only read for an admin. */
  commission: string;
};

export type RestaurantField =
  | 'name'
  | 'address'
  | 'phone'
  | 'region'
  | 'categories'
  | 'location'
  | 'openTime'
  | 'closeTime'
  | 'hours'
  | 'breakStart'
  | 'breakEnd'
  | 'breakHours'
  | 'workingDays'
  | 'commission';

/* ---- clock times ------------------------------------------------------------ */

export function timeText(time: ClockTime | null | undefined): string {
  if (!time || typeof time.h !== 'number') return '';
  return `${String(time.h).padStart(2, '0')}:${String(time.mn ?? 0).padStart(2, '0')}`;
}

export function parseTime(text: string): ClockTime | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const mn = Number(match[2]);
  return h <= 23 && mn <= 59 ? { h, mn } : null;
}

function minutes(time: ClockTime): number {
  return (time.h ?? 0) * 60 + (time.mn ?? 0);
}

/* ---- commission -------------------------------------------------------------- */

/** 0.15 → '15'. Rounded to two decimals of a percent, which is finer than anyone sets. */
export function commissionText(fee: number | undefined): string {
  if (typeof fee !== 'number' || !Number.isFinite(fee)) return '';
  return String(Math.round(fee * 10_000) / 100);
}

/** '12.5' → 0.125, or null unless it is a percentage from 0 to 100. */
export function parseCommission(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(trimmed)) return null;
  const percent = Number(trimmed);
  return percent <= 100 ? Math.round(percent * 100) / 10_000 : null;
}

/** A restaurant an admin should look at: the rate is missing or zero, so Switch bills it
 * nothing. */
export function hasNoCommission(row: Pick<RestaurantRow, 'fee'>): boolean {
  return typeof row.fee !== 'number' || row.fee <= 0;
}

/* ---- drafts ------------------------------------------------------------------ */

export function emptyRestaurantDraft(regionId: string): RestaurantDraft {
  return {
    name: '',
    description: '',
    address: '',
    phone: '',
    regionId,
    categoryIds: [],
    location: null,
    openTime: '',
    closeTime: '',
    hasBreak: false,
    breakStart: '',
    breakEnd: '',
    workingDays: [...WEEKDAYS],
    isFeatured: false,
    active: true,
    enabled: true,
    commission: '',
  };
}

export function draftFromRestaurant(row: RestaurantRow): RestaurantDraft {
  // The dashboard writes a break as a pair and clears both when they are equal, so a row
  // with only one side set has no break the apps would apply.
  const hasBreak = !!row.pauseStart && !!row.pauseEnd;
  return {
    name: row.name ?? '',
    description: row.description ?? '',
    address: row.address ?? '',
    phone: row.phone ?? '',
    regionId: row.city?.objectId ?? '',
    categoryIds: (row.categories ?? []).map((category) => category.objectId),
    location: toLatLng(row.location),
    openTime: timeText(row.openTime),
    closeTime: timeText(row.closeTime),
    hasBreak,
    breakStart: hasBreak ? timeText(row.pauseStart) : '',
    breakEnd: hasBreak ? timeText(row.pauseEnd) : '',
    workingDays: [...(row.workingDays ?? [])].sort((a, b) => a - b),
    isFeatured: row.isFeatured === true,
    active: row.active === true,
    enabled: row.enabled === true,
    commission: commissionText(row.fee),
  };
}

/** Every problem with a draft, in the order the form shows its fields. Empty means it can
 * be saved. */
export function validateRestaurantDraft(
  draft: RestaurantDraft,
  { canSetCommission }: { canSetCommission: boolean },
): RestaurantField[] {
  const problems: RestaurantField[] = [];
  if (!draft.name.trim()) problems.push('name');
  if (!draft.phone.trim()) problems.push('phone');
  if (!draft.address.trim()) problems.push('address');
  if (!draft.regionId) problems.push('region');
  if (draft.categoryIds.length === 0) problems.push('categories');
  if (!draft.location) problems.push('location');

  const open = parseTime(draft.openTime);
  const close = parseTime(draft.closeTime);
  if (!open) problems.push('openTime');
  if (!close) problems.push('closeTime');
  if (open && close && minutes(close) <= minutes(open)) problems.push('hours');

  if (draft.hasBreak) {
    const start = parseTime(draft.breakStart);
    const end = parseTime(draft.breakEnd);
    if (!start) problems.push('breakStart');
    if (!end) problems.push('breakEnd');
    if (
      start &&
      end &&
      (minutes(end) <= minutes(start) ||
        (open && minutes(start) < minutes(open)) ||
        (close && minutes(end) > minutes(close)))
    ) {
      problems.push('breakHours');
    }
  }

  if (draft.workingDays.length === 0) problems.push('workingDays');
  if (canSetCommission && parseCommission(draft.commission) === null) problems.push('commission');
  return problems;
}

/* ---- the columns written ----------------------------------------------------- */

export type RestaurantFields = Record<string, unknown>;

/** A pointer literal, spelled out here so this module stays free of the Parse SDK. */
function pointerTo<ClassName extends string>(className: ClassName, objectId: string): ParsePointer<ClassName> {
  return { __type: 'Pointer', className, objectId };
}

/**
 * The columns a draft writes. Call only on a draft that validated.
 *
 * - `searchName` is `name` lower-cased, as the dashboard writes it for the customer app's
 *   search.
 * - `fee` is written only when the account may set it — or on create, where the schema
 *   requires one and a staff account's restaurant starts on `DEFAULT_COMMISSION_RATE`.
 * - `active` and `enabled` are written only on create.
 */
export function restaurantFields(
  draft: RestaurantDraft,
  { isCreate, canSetCommission }: { isCreate: boolean; canSetCommission: boolean },
): RestaurantFields {
  const breakStart = draft.hasBreak ? parseTime(draft.breakStart) : null;
  const breakEnd = draft.hasBreak ? parseTime(draft.breakEnd) : null;
  const name = draft.name.trim();

  const fields: RestaurantFields = {
    name,
    searchName: name.toLowerCase(),
    description: draft.description.trim(),
    address: draft.address.trim(),
    phone: draft.phone.trim(),
    city: pointerTo('City', draft.regionId),
    categories: draft.categoryIds.map((id) => pointerTo('Category', id)),
    location: draft.location
      ? {
          __type: 'GeoPoint',
          latitude: Math.round(draft.location.lat * 1e6) / 1e6,
          longitude: Math.round(draft.location.lng * 1e6) / 1e6,
        }
      : undefined,
    openTime: parseTime(draft.openTime),
    closeTime: parseTime(draft.closeTime),
    // Null rather than left out: clearing a break has to reach the row.
    pauseStart: breakStart && breakEnd ? breakStart : null,
    pauseEnd: breakStart && breakEnd ? breakEnd : null,
    workingDays: [...draft.workingDays].sort((a, b) => a - b),
    isFeatured: draft.isFeatured,
  };

  if (canSetCommission) fields.fee = parseCommission(draft.commission) ?? DEFAULT_COMMISSION_RATE;
  else if (isCreate) fields.fee = DEFAULT_COMMISSION_RATE;

  if (isCreate) {
    fields.active = draft.active;
    fields.enabled = draft.enabled;
  }
  return fields;
}

/**
 * Only the columns the form actually changed, compared with the row as it was loaded.
 *
 * The manager app edits the same restaurant — its hours and its Pause switch — so writing
 * every column back would quietly undo whatever the kitchen changed while this form was
 * open. Comparing against the loaded row's own fields, built the same way, means a column
 * nobody touched is never sent.
 */
export function changedRestaurantFields(next: RestaurantFields, previous: RestaurantFields): RestaurantFields {
  const changed: RestaurantFields = {};
  for (const [key, value] of Object.entries(next)) {
    if (JSON.stringify(value) !== JSON.stringify(previous[key])) changed[key] = value;
  }
  return changed;
}
