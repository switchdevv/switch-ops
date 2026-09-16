'use client';

import { Button } from '@heroui/react';
import { useI18n } from '@/lib/i18n/provider';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { categoryName } from '@/lib/ops/catalogue';
import {
  activeRestaurantFilterCount,
  RESTAURANT_SEARCH_FIELDS,
  RESTAURANT_SORTS,
  RESTAURANT_STATUSES,
  type RestaurantFilters,
  type RestaurantSearchField,
  type RestaurantSort,
  type RestaurantStatus,
} from '@/lib/url/restaurant-filters';
import type { City } from '@/types/city';
import type { Category } from '@/types/restaurant';
import { SelectField, type SelectOption } from '@/components/ui/select-field';
import { SearchBox } from './search-box';

const FIELD_LABEL: Record<RestaurantSearchField, MessageKey> = {
  name: 'catalogue.search.name',
  phone: 'catalogue.search.phone',
  objectId: 'catalogue.search.restaurantId',
  manager: 'catalogue.search.managerId',
};

const STATUS_LABEL: Record<RestaurantStatus, MessageKey> = {
  live: 'catalogue.status.live',
  paused: 'catalogue.status.paused',
  disabled: 'catalogue.status.disabled',
};

const SORT_LABEL: Record<RestaurantSort, MessageKey> = {
  name: 'catalogue.sort.name',
  newest: 'catalogue.sort.newest',
};

/** The restaurant list's search and filters. Same shape as the orders toolbar: the text is
 * committed on submit, the dropdowns apply the moment they change. */
export function RestaurantsToolbar({
  filters,
  cities,
  categories,
  pinnedRegion,
  onChange,
  onReset,
}: {
  filters: RestaurantFilters;
  cities: City[] | undefined;
  categories: Category[] | undefined;
  pinnedRegion: string;
  onChange: (patch: Partial<RestaurantFilters>) => void;
  onReset: () => void;
}) {
  const { t, tCount, locale } = useI18n();

  const regionOptions: SelectOption[] = pinnedRegion
    ? [{ value: pinnedRegion, label: cities?.find((city) => city.objectId === pinnedRegion)?.name ?? pinnedRegion }]
    : [
        { value: '', label: t('orders.filters.anyRegion') },
        ...(cities ?? []).map((city) => ({ value: city.objectId, label: city.name ?? city.objectId })),
      ];

  const categoryOptions: SelectOption[] = [
    { value: '', label: t('catalogue.filters.anyCategory') },
    ...(categories ?? [])
      .map((category) => ({ value: category.objectId, label: categoryName(category, locale) }))
      .sort((a, b) => a.label.localeCompare(b.label, locale)),
  ];

  const activeCount = activeRestaurantFilterCount(filters, pinnedRegion);

  return (
    <section className="border-border/70 bg-surface rounded-card shadow-card border">
      <SearchBox
        query={filters.query}
        field={filters.field}
        fields={RESTAURANT_SEARCH_FIELDS.map((field) => ({ value: field, label: t(FIELD_LABEL[field]) }))}
        placeholder={t(filters.field === 'name' ? 'catalogue.search.namePlaceholder' : 'catalogue.search.placeholder')}
        onFieldChange={(field) => onChange({ field: field as RestaurantSearchField })}
        onSubmit={(query) => onChange({ query })}
      />

      <div className="flex flex-col gap-3 p-4 sm:p-5">
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
            label={t('catalogue.filters.category')}
            value={filters.category}
            options={categoryOptions}
            onChange={(category) => onChange({ category })}
            className="w-44"
          />
          <SelectField
            label={t('catalogue.filters.status')}
            value={filters.status}
            options={[
              { value: '', label: t('catalogue.filters.anyStatus') },
              ...RESTAURANT_STATUSES.map((status) => ({ value: status, label: t(STATUS_LABEL[status]) })),
            ]}
            onChange={(status) => onChange({ status: status as RestaurantStatus | '' })}
            className="w-40"
          />
          <SelectField
            label={t('catalogue.filters.sort')}
            value={filters.sort}
            options={RESTAURANT_SORTS.map((sort) => ({ value: sort, label: t(SORT_LABEL[sort]) }))}
            onChange={(sort) => onChange({ sort: sort as RestaurantSort })}
            className="w-40"
          />
          <label className="border-border/70 bg-surface-secondary/50 hover:bg-surface-tertiary flex h-9 cursor-pointer items-center gap-2 rounded-xl border px-3 transition-colors">
            <input
              type="checkbox"
              checked={filters.featuredOnly}
              onChange={(event) => onChange({ featuredOnly: event.target.checked })}
              className="accent-accent size-4"
            />
            <span className="text-body">{t('catalogue.filters.featuredOnly')}</span>
          </label>

          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onPress={onReset} className="h-9">
              {t('orders.filters.reset')} · {tCount('orders.filters.active', activeCount)}
            </Button>
          )}
        </div>

        {pinnedRegion && <p className="text-caption text-faint">{t('catalogue.filters.regionLocked')}</p>}
      </div>
    </section>
  );
}
