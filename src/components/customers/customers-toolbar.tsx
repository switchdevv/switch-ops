'use client';

import { Button } from '@heroui/react';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { useI18n } from '@/lib/i18n/provider';
import { CUSTOMER_STATUSES, type CustomerStatus } from '@/lib/ops/customers';
import {
  activeCustomerFilterCount,
  CUSTOMER_SEARCH_FIELDS,
  CUSTOMER_SORTS,
  type CustomerFilters,
  type CustomerSearchField,
  type CustomerSort,
} from '@/lib/url/customer-filters';
import type { City } from '@/types/city';
import { SelectField, type SelectOption } from '@/components/ui/select-field';
import { SearchBox } from '@/components/restaurants/search-box';

const FIELD_LABEL: Record<CustomerSearchField, MessageKey> = {
  name: 'customers.search.name',
  phone: 'customers.search.phone',
  email: 'customers.search.email',
  username: 'customers.search.username',
  objectId: 'customers.search.objectId',
};

const FIELD_PLACEHOLDER: Record<CustomerSearchField, MessageKey> = {
  name: 'customers.search.namePlaceholder',
  phone: 'customers.search.phonePlaceholder',
  email: 'customers.search.emailPlaceholder',
  username: 'customers.search.placeholder',
  objectId: 'customers.search.placeholder',
};

const STATUS_LABEL: Record<CustomerStatus, MessageKey> = {
  enabled: 'customers.status.enabled',
  disabled: 'customers.status.disabled',
};

const SORT_LABEL: Record<CustomerSort, MessageKey> = {
  newest: 'customers.sort.newest',
  name: 'customers.sort.name',
};

/** The customer list's search and filters: the text is committed on submit, the dropdowns
 * apply the moment they change — the restaurant toolbar's shape. */
export function CustomersToolbar({
  filters,
  cities,
  pinnedRegion,
  onChange,
  onReset,
}: {
  filters: CustomerFilters;
  cities: City[] | undefined;
  pinnedRegion: string;
  onChange: (patch: Partial<CustomerFilters>) => void;
  onReset: () => void;
}) {
  const { t, tCount } = useI18n();

  const regionOptions: SelectOption[] = pinnedRegion
    ? [{ value: pinnedRegion, label: cities?.find((city) => city.objectId === pinnedRegion)?.name ?? pinnedRegion }]
    : [
        { value: '', label: t('orders.filters.anyRegion') },
        ...(cities ?? []).map((city) => ({ value: city.objectId, label: city.name ?? city.objectId })),
      ];

  const activeCount = activeCustomerFilterCount(filters, pinnedRegion);

  return (
    <section className="border-border/70 bg-surface rounded-card shadow-card border">
      <SearchBox
        query={filters.query}
        field={filters.field}
        fields={CUSTOMER_SEARCH_FIELDS.map((field) => ({ value: field, label: t(FIELD_LABEL[field]) }))}
        placeholder={t(FIELD_PLACEHOLDER[filters.field])}
        onFieldChange={(field) => onChange({ field: field as CustomerSearchField })}
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
            label={t('customers.filters.status')}
            value={filters.status}
            options={[
              { value: '', label: t('customers.filters.anyStatus') },
              ...CUSTOMER_STATUSES.map((status) => ({ value: status, label: t(STATUS_LABEL[status]) })),
            ]}
            onChange={(status) => onChange({ status: status as CustomerStatus | '' })}
            className="w-40"
          />
          <SelectField
            label={t('customers.filters.sort')}
            value={filters.sort}
            options={CUSTOMER_SORTS.map((sort) => ({ value: sort, label: t(SORT_LABEL[sort]) }))}
            onChange={(sort) => onChange({ sort: sort as CustomerSort })}
            className="w-40"
          />

          {activeCount > 0 && (
            <Button variant="ghost" size="sm" onPress={onReset} className="h-9">
              {t('orders.filters.reset')} · {tCount('orders.filters.active', activeCount)}
            </Button>
          )}
        </div>

        {pinnedRegion && <p className="text-caption text-faint">{t('customers.filters.regionLocked')}</p>}
      </div>
    </section>
  );
}
