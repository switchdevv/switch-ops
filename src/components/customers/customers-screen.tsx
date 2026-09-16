'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@heroui/react';
import { useAccess } from '@/hooks/use-access';
import { useCities } from '@/hooks/use-cities';
import { useCustomers } from '@/hooks/use-customers';
import { useSession } from '@/hooks/use-session';
import { pinnedRegionId } from '@/lib/auth/access';
import { useI18n } from '@/lib/i18n/provider';
import { CUSTOMER_PAGE_SIZE } from '@/lib/services/customers';
import {
  confineCustomersToRegion,
  emptyCustomerFilters,
  parseCustomerFilters,
  parseCustomerListPage,
  serializeCustomerFilters,
  type CustomerFilters,
} from '@/lib/url/customer-filters';
import { readRememberedSearch, writeRememberedSearch } from '@/lib/url/remembered-search';
import { Notice, type NoticeValue } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ListEmpty, PagedList } from '@/components/ui/paged-list';
import { PlusIcon } from '@/components/icons';
import { CustomerFormDialog } from './customer-form-dialog';
import { CustomerListRow } from './customer-row';
import { CustomersToolbar } from './customers-toolbar';

/**
 * The customer list — switch-dashboard's Users page, for the accounts of the customer app.
 *
 * Built like the restaurant list: the whole state is the query string (remembered when the
 * page is left), a staff account's region is pinned where the URL is read, the list pages on
 * the server, and a filter change goes back to page one. Staff accounts never see staff rows.
 */
export function CustomersScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { region, role, account } = useAccess();
  const { data: user } = useSession();
  const pinnedRegion = pinnedRegionId(region);
  const hideStaff = role !== 'admin';
  const search = searchParams.toString();
  const [isAdding, setIsAdding] = useState(false);
  const [notice, setNotice] = useState<NoticeValue | null>(null);

  const filters = useMemo(
    () => confineCustomersToRegion(parseCustomerFilters(new URLSearchParams(search)), pinnedRegion),
    [search, pinnedRegion],
  );
  const page = parseCustomerListPage(new URLSearchParams(search));

  // Read during render, as the restaurant list does, so the unfiltered list is never asked
  // for on the way back to the filtered one.
  const memoryScope = `customers.${account?.objectId ?? ''}`;
  const restoreTo = search === '' ? readRememberedSearch(memoryScope) : null;
  const filtersSearch = serializeCustomerFilters(filters, 1);

  useEffect(() => {
    if (restoreTo) router.replace(`${pathname}${restoreTo}`, { scroll: false });
    else writeRememberedSearch(memoryScope, filtersSearch);
  }, [restoreTo, filtersSearch, memoryScope, pathname, router]);

  const customersQuery = useCustomers(filters, page, hideStaff, !restoreTo);
  const citiesQuery = useCities();
  const regionNames = useMemo(
    () => new Map((citiesQuery.data ?? []).map((city) => [city.objectId, city.name ?? city.objectId])),
    [citiesQuery.data],
  );

  // Remembered before navigating: taking off the last filter lands on the bare URL, which
  // would otherwise restore what was just taken off.
  const navigate = useCallback(
    (next: CustomerFilters, nextPage: number) => {
      writeRememberedSearch(memoryScope, serializeCustomerFilters(next, 1));
      router.replace(`${pathname}${serializeCustomerFilters(next, nextPage)}`, { scroll: false });
    },
    [memoryScope, pathname, router],
  );
  const applyFilters = useCallback(
    (patch: Partial<CustomerFilters>) => navigate({ ...filters, ...patch }, 1),
    [filters, navigate],
  );
  const resetFilters = useCallback(
    () => navigate(confineCustomersToRegion({ ...emptyCustomerFilters(), field: filters.field }, pinnedRegion), 1),
    [filters.field, navigate, pinnedRegion],
  );

  const rows = customersQuery.data?.results ?? [];
  const hasFilters = !!(filters.query || filters.status || (filters.region && !pinnedRegion));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={t('customers.eyebrow')}
        title={t('customers.list.title')}
        description={t('customers.list.subtitle')}
        actions={
          <Button variant="primary" size="md" onPress={() => setIsAdding(true)}>
            <PlusIcon aria-hidden className="size-4" />
            {t('customers.list.add')}
          </Button>
        }
      />

      {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}

      <CustomersToolbar
        filters={filters}
        cities={citiesQuery.data}
        pinnedRegion={pinnedRegion}
        onChange={applyFilters}
        onReset={resetFilters}
      />

      <PagedList
        status={customersQuery.status}
        error={customersQuery.error}
        isPlaceholderData={customersQuery.isPlaceholderData}
        isFetching={customersQuery.isFetching}
        page={page}
        pageSize={CUSTOMER_PAGE_SIZE}
        total={customersQuery.data?.count ?? 0}
        rowCount={rows.length}
        errorTitle={t('customers.list.error')}
        onRetry={() => void customersQuery.refetch()}
        onPageChange={(nextPage) => navigate(filters, nextPage)}
        empty={
          <ListEmpty
            title={t('customers.list.emptyTitle')}
            body={hasFilters ? t('customers.list.emptyFiltered') : t('customers.list.emptyBody')}
            actions={
              hasFilters ? (
                <Button variant="secondary" size="sm" onPress={resetFilters}>
                  {t('customers.list.clear')}
                </Button>
              ) : undefined
            }
          />
        }
      >
        {rows.map((customer) => (
          <CustomerListRow
            key={customer.objectId}
            customer={customer}
            regionName={customer.city ? regionNames.get(customer.city.objectId) : undefined}
            isSelf={customer.objectId === user?.id}
          />
        ))}
      </PagedList>

      {isAdding && (
        <CustomerFormDialog
          mode="add"
          onClose={() => setIsAdding(false)}
          onDone={(name) => {
            setIsAdding(false);
            setNotice({ kind: 'success', title: t('customers.form.created', { customer: name }) });
          }}
        />
      )}
    </div>
  );
}
