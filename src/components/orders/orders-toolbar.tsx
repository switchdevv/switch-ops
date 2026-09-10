'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@heroui/react';
import { useI18n } from '@/lib/i18n/provider';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { ORDER_STAGES, STAGE_LABEL_KEY } from '@/lib/ops/order-status';
import { RANGE_PRESETS, resolveRange, todayIso, type RangePreset } from '@/lib/ops/date-range';
import { activeFilterCount, SEARCH_FIELDS, type OrderFilters, type SearchField } from '@/lib/url/order-filters';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SelectField, type SelectOption } from '@/components/ui/select-field';
import { CloseIcon, FilterIcon, SearchIcon } from '@/components/icons';
import type { City } from '@/types/city';

const RANGE_LABEL_KEY: Record<RangePreset, MessageKey> = {
  today: 'orders.range.today',
  yesterday: 'orders.range.yesterday',
  week: 'orders.range.week',
  month: 'orders.range.month',
  all: 'orders.range.all',
  custom: 'orders.range.custom',
};

const SEARCH_FIELD_LABEL_KEY: Record<SearchField, MessageKey> = {
  objectId: 'orders.search.orderId',
  user: 'orders.search.userId',
  driver: 'orders.search.driverId',
  restaurant: 'orders.search.restaurantId',
};

export function OrdersToolbar({
  filters,
  cities,
  pinnedRegion,
  onChange,
  onReset,
}: {
  filters: OrderFilters;
  cities: City[] | undefined;
  /** The one region a staff account may look at, or `''` for an admin. The board has
   * already pinned the filters to it; what this does here is stop the control from
   * offering a choice it would silently ignore. */
  pinnedRegion: string;
  /** Applies a partial change and resets to page 1 — see the board. */
  onChange: (patch: Partial<OrderFilters>) => void;
  onReset: () => void;
}) {
  const { t, tCount } = useI18n();

  // The text box is local state, committed on submit. Filtering on every keystroke
  // would fire a Parse query per character, and an id search is meaningless until the
  // whole id is typed anyway — the dropdowns below apply immediately precisely because
  // they *are* complete the moment they change.
  const [draft, setDraft] = useState(filters.query);

  // Keeps the box in step when the query changes from outside it — the browser's Back
  // button, or a shared URL opened in this tab. Adjusting state during render rather
  // than in an effect: React re-runs this component immediately with the new value
  // instead of painting the stale one first and correcting it a frame later.
  const [lastAppliedQuery, setLastAppliedQuery] = useState(filters.query);
  if (lastAppliedQuery !== filters.query) {
    setLastAppliedQuery(filters.query);
    setDraft(filters.query);
  }

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    onChange({ query: draft.trim() });
  };

  const activeCount = activeFilterCount(filters, pinnedRegion);

  // Confined to one region: the control keeps its place in the row and still names the
  // region, but holds a single option. Disabled rather than removed on purpose — a
  // missing Region filter invites "where did it go?", while a filled-in, greyed-out one
  // answers the question the hidden orders would otherwise raise.
  const regionOptions: SelectOption[] = pinnedRegion
    ? [{ value: pinnedRegion, label: regionName(cities, pinnedRegion) }]
    : [
        { value: '', label: t('orders.filters.anyRegion') },
        ...(cities ?? []).map((city) => ({
          value: city.objectId,
          label: city.name ?? city.objectId,
        })),
      ];

  const typeOptions: SelectOption[] = [
    { value: '', label: t('orders.filters.anyType') },
    { value: 'delivery', label: t('orders.type.delivery') },
    { value: 'pickup', label: t('orders.type.pickup') },
  ];

  const stageOptions: SelectOption[] = [
    { value: '', label: t('orders.filters.anyStage') },
    ...ORDER_STAGES.map((stage) => ({ value: stage, label: t(STAGE_LABEL_KEY[stage]) })),
  ];

  return (
    <section className="border-border/70 bg-surface rounded-card shadow-card border">
      <form
        onSubmit={submitSearch}
        className="border-separator/70 flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-end sm:p-5"
      >
        <SelectField
          label={t('orders.search.field')}
          value={filters.field}
          options={SEARCH_FIELDS.map((field) => ({
            value: field,
            label: t(SEARCH_FIELD_LABEL_KEY[field]),
          }))}
          onChange={(value) => onChange({ field: value as SearchField })}
          className="sm:w-44"
        />

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label
            htmlFor="orders-search"
            className="text-micro text-muted font-bold tracking-[0.1em] uppercase"
          >
            {t('orders.search.label')}
          </label>
          <div className="relative flex-1">
            <SearchIcon
              aria-hidden
              className="text-muted pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2"
            />
            <input
              id="orders-search"
              type="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={t('orders.search.placeholder')}
              autoComplete="off"
              spellCheck={false}
              className="text-body tabular border-field-border bg-field-background text-field-foreground placeholder:text-field-placeholder focus-visible:ring-focus h-9 w-full rounded-xl border ps-9 pe-9 outline-none focus-visible:ring-2"
            />
            {draft && (
              <button
                type="button"
                onClick={() => {
                  setDraft('');
                  onChange({ query: '' });
                }}
                aria-label={t('orders.search.clear')}
                className="text-muted hover:text-foreground focus-visible:ring-focus absolute end-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-lg outline-none focus-visible:ring-2"
              >
                <CloseIcon className="size-4" />
              </button>
            )}
          </div>
        </div>

        <Button type="submit" variant="primary" size="md" className="sm:w-auto">
          {t('orders.search.submit')}
        </Button>
      </form>

      <div className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-micro text-muted flex items-center gap-1.5 font-bold tracking-[0.1em] uppercase">
            <FilterIcon className="size-3.5" />
            {t('orders.range.label')}
          </span>
          <SegmentedControl
            label={t('orders.range.label')}
            options={RANGE_PRESETS.map((preset) => ({
              key: preset,
              label: t(RANGE_LABEL_KEY[preset]),
            }))}
            value={filters.range.preset}
            onChange={(preset) =>
              onChange({
                // Seeded from whatever the current range resolved to, so switching to
                // Custom starts on the dates you were already looking at instead of
                // snapping back to today and losing your place.
                range: resolveRange(preset, filters.range.from, filters.range.to),
              })
            }
          />

          {filters.range.preset === 'custom' && (
            <div className="flex items-center gap-2">
              <DateInput
                label={t('orders.range.from')}
                value={filters.range.from}
                max={filters.range.to}
                onChange={(value) =>
                  onChange({ range: resolveRange('custom', value, filters.range.to) })
                }
              />
              <span className="text-muted text-caption">–</span>
              <DateInput
                label={t('orders.range.to')}
                value={filters.range.to}
                min={filters.range.from}
                max={todayIso()}
                onChange={(value) =>
                  onChange({ range: resolveRange('custom', filters.range.from, value) })
                }
              />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label={t('orders.filters.region')}
            value={filters.region}
            options={regionOptions}
            isDisabled={pinnedRegion.length > 0}
            onChange={(region) => onChange({ region })}
            className="w-44"
          />
          <SelectField
            label={t('orders.filters.type')}
            value={filters.type}
            options={typeOptions}
            onChange={(value) => onChange({ type: value as OrderFilters['type'] })}
            className="w-40"
          />
          <SelectField
            label={t('orders.filters.stage')}
            value={filters.stage}
            options={stageOptions}
            onChange={(value) => onChange({ stage: value as OrderFilters['stage'] })}
            className="w-40"
          />

          <label className="border-border/70 bg-surface-secondary/50 hover:bg-surface-tertiary flex h-9 cursor-pointer items-center gap-2 rounded-xl border px-3 transition-colors">
            <input
              type="checkbox"
              checked={filters.needsDriver}
              onChange={(event) => onChange({ needsDriver: event.target.checked })}
              className="accent-accent size-4"
            />
            <span className="text-body">{t('orders.filters.unassignedOnly')}</span>
          </label>

          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onPress={onReset} className="h-9">
              {t('orders.filters.reset')} · {tCount('orders.filters.active', activeCount)}
            </Button>
          )}
        </div>

        <p className="text-caption text-faint">
          {pinnedRegion
            ? `${t('orders.filters.regionLocked')} ${t('orders.search.hint')}`
            : t('orders.search.hint')}
        </p>
      </div>
    </section>
  );
}

/** The pinned region's name from the cached city list — falling back to its id, which
 * is at least stable and copyable, rather than to a blank control. */
function regionName(cities: City[] | undefined, regionId: string): string {
  return cities?.find((city) => city.objectId === regionId)?.name ?? regionId;
}

/**
 * Native `<input type="date">` rather than a popover calendar: it is keyboard- and
 * locale-native, opens the platform's own picker on every device, and can't get into a
 * half-selected state the way a range calendar can mid-drag. Its value format
 * (YYYY-MM-DD) is also exactly what the URL and the range resolver already speak.
 */
function DateInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-micro text-muted font-bold tracking-[0.08em] uppercase">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        // An empty value means the field was cleared mid-edit; committing that would
        // resolve to "today" and yank the board out from under the user.
        onChange={(event) => event.target.value && onChange(event.target.value)}
        className="text-caption tabular border-field-border bg-field-background focus-visible:ring-focus rounded-lg border px-2.5 py-1.5 outline-none focus-visible:ring-2"
      />
    </label>
  );
}
