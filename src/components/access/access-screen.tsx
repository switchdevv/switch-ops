'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@heroui/react';
import { useCities } from '@/hooks/use-cities';
import { useSession } from '@/hooks/use-session';
import { useStaffAccounts } from '@/hooks/use-staff';
import { useI18n } from '@/lib/i18n/provider';
import { STAFF_PAGE_SIZE } from '@/lib/services/staff';
import {
  activeAccessFilterCount,
  emptyAccessFilters,
  parseAccessFilters,
  parseAccessPage,
  serializeAccessFilters,
  type AccessFilters,
} from '@/lib/url/access-filters';
import { PageHeader } from '@/components/ui/page-header';
import { ListEmpty, PagedList } from '@/components/ui/paged-list';
import { RequireAdmin } from '@/components/require-admin';
import { AccessRow } from './access-row';
import { AccessToolbar } from './access-toolbar';

/**
 * Who may use Switch Ops — switch-finance's Access page, for this console.
 *
 * Every staff account (a Staff or Admin `staffType`, set up for the staff app) is listed
 * with its grant; admins have the console by role and can't be switched off. Admin-only,
 * behind RequireAdmin, and the list's own queries live below that gate so a staff account
 * that types the URL never asks the server for the pool.
 */
export function AccessScreen() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader eyebrow={t('access.eyebrow')} title={t('access.title')} description={t('access.subtitle')} />
      <RequireAdmin>
        <AccessList />
      </RequireAdmin>
    </div>
  );
}

function AccessList() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: user } = useSession();
  const search = searchParams.toString();

  const filters = useMemo(() => parseAccessFilters(new URLSearchParams(search)), [search]);
  const page = parseAccessPage(new URLSearchParams(search));

  const staffQuery = useStaffAccounts(filters, page);
  const citiesQuery = useCities();
  const regionNames = useMemo(
    () => new Map((citiesQuery.data ?? []).map((city) => [city.objectId, city.name ?? city.objectId])),
    [citiesQuery.data],
  );

  const navigate = useCallback(
    (next: AccessFilters, nextPage: number) =>
      router.replace(`${pathname}${serializeAccessFilters(next, nextPage)}`, { scroll: false }),
    [pathname, router],
  );
  // Any filter change goes back to page one: the page the admin was on described a
  // different set of rows.
  const applyFilters = useCallback(
    (patch: Partial<AccessFilters>) => navigate({ ...filters, ...patch }, 1),
    [filters, navigate],
  );
  const resetFilters = useCallback(() => navigate(emptyAccessFilters(), 1), [navigate]);

  const rows = staffQuery.data?.results ?? [];
  const hasFilters = activeAccessFilterCount(filters) > 0;

  return (
    <>
      <AccessToolbar filters={filters} onChange={applyFilters} onReset={resetFilters} />

      <PagedList
        status={staffQuery.status}
        error={staffQuery.error}
        isPlaceholderData={staffQuery.isPlaceholderData}
        isFetching={staffQuery.isFetching}
        page={page}
        pageSize={STAFF_PAGE_SIZE}
        total={staffQuery.data?.count ?? 0}
        rowCount={rows.length}
        errorTitle={t('access.list.error')}
        onRetry={() => void staffQuery.refetch()}
        onPageChange={(nextPage) => navigate(filters, nextPage)}
        empty={
          <ListEmpty
            title={t('access.list.emptyTitle')}
            body={hasFilters ? t('access.list.emptyFiltered') : t('access.list.emptyBody')}
            actions={
              hasFilters ? (
                <Button variant="secondary" size="sm" onPress={resetFilters}>
                  {t('access.list.clear')}
                </Button>
              ) : undefined
            }
          />
        }
      >
        {rows.map((account) => (
          <AccessRow
            key={account.objectId}
            account={account}
            regionName={account.city ? regionNames.get(account.city.objectId) : undefined}
            isSelf={account.objectId === user?.id}
          />
        ))}
      </PagedList>
    </>
  );
}
