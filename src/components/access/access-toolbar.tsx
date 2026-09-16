'use client';

import { Button } from '@heroui/react';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { useI18n } from '@/lib/i18n/provider';
import {
  ACCESS_FILTERS,
  activeAccessFilterCount,
  type AccessFilter,
  type AccessFilters,
} from '@/lib/url/access-filters';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SearchBox } from '@/components/restaurants/search-box';

const ACCESS_LABEL: Record<AccessFilter, MessageKey> = {
  all: 'access.filters.all',
  granted: 'access.filters.granted',
  denied: 'access.filters.denied',
  admins: 'access.filters.admins',
};

/** The Access page's search and filter: the username is committed on submit, the access
 * slice applies the moment it changes — the other list toolbars' shape. */
export function AccessToolbar({
  filters,
  onChange,
  onReset,
}: {
  filters: AccessFilters;
  onChange: (patch: Partial<AccessFilters>) => void;
  onReset: () => void;
}) {
  const { t, tCount } = useI18n();
  const activeCount = activeAccessFilterCount(filters);

  return (
    <section className="border-border/70 bg-surface rounded-card shadow-card border">
      <SearchBox
        query={filters.query}
        placeholder={t('access.filters.searchPlaceholder')}
        onSubmit={(query) => onChange({ query })}
      />

      <div className="flex flex-wrap items-center gap-3 p-4 sm:p-5">
        <SegmentedControl
          label={t('access.filters.label')}
          options={ACCESS_FILTERS.map((key) => ({ key, label: t(ACCESS_LABEL[key]) }))}
          value={filters.access}
          onChange={(access) => onChange({ access })}
        />

        {activeCount > 0 && (
          <Button variant="ghost" size="sm" onPress={onReset} className="h-9">
            {t('orders.filters.reset')} · {tCount('orders.filters.active', activeCount)}
          </Button>
        )}
      </div>
    </section>
  );
}
