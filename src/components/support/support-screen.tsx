'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@heroui/react';
import { useAccess } from '@/hooks/use-access';
import { useCities } from '@/hooks/use-cities';
import { useNow } from '@/hooks/use-now';
import { useSupportMessages, useSupportUnreadCount } from '@/hooks/use-support';
import { useReadMarks } from '@/hooks/use-support-read-marks';
import { pinnedRegionId } from '@/lib/auth/access';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { useI18n } from '@/lib/i18n/provider';
import { resolveRange } from '@/lib/ops/date-range';
import { isUnread, SENDER_APP_LABEL_KEY, SENDER_APPS, type ReadMarks, type SenderApp } from '@/lib/ops/support';
import { SUPPORT_PAGE_SIZE } from '@/lib/services/support';
import {
  activeSupportFilterCount,
  confineSupportToRegion,
  emptySupportFilters,
  parseSelectedMessage,
  parseSupportFilters,
  parseSupportPage,
  serializeSupportFilters,
  SUPPORT_RANGES,
  SUPPORT_SEARCH_FIELDS,
  type SupportFilters,
  type SupportRange,
  type SupportSearchField,
} from '@/lib/url/support-filters';
import { readRememberedSearch, writeRememberedSearch } from '@/lib/url/remembered-search';
import { LiveControl } from '@/components/ui/live-control';
import { Notice, type NoticeValue } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ListEmpty, PagedList } from '@/components/ui/paged-list';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { SelectField, type SelectOption } from '@/components/ui/select-field';
import { SearchBox } from '@/components/restaurants/search-box';
import { CheckIcon } from '@/components/icons';
import { MessageReader, ReaderPlaceholder } from './message-reader';
import { MessageRow } from './message-row';

const RANGE_LABEL_KEY: Record<SupportRange, MessageKey> = {
  today: 'orders.range.today',
  week: 'orders.range.week',
  month: 'orders.range.month',
  all: 'orders.range.all',
};

const SEARCH_FIELD_LABEL_KEY: Record<SupportSearchField, MessageKey> = {
  fullname: 'support.search.fullname',
  phone: 'support.search.phone',
  email: 'support.search.email',
  message: 'support.search.message',
  objectId: 'support.search.objectId',
  user: 'support.search.user',
};

type View = 'all' | 'unread';

/**
 * The support inbox — switch-dashboard's Support page, rebuilt as an inbox rather than a
 * table: the list on the left, the open message on the right with the person behind it,
 * and the ways to answer them one click away.
 *
 * Built like the other lists — the whole state in the query string (the open message
 * included, so "look at this one" is a link), a staff account's region pinned where the URL
 * is read, the last list remembered per account. Unread is this account's own, on this
 * browser (see hooks/use-support-read-marks.ts).
 */
export function SupportScreen() {
  const { t, format } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { region, account } = useAccess();
  const pinnedRegion = pinnedRegionId(region);
  const search = searchParams.toString();
  const accountId = account?.objectId ?? '';

  const filters = useMemo(
    () => confineSupportToRegion(parseSupportFilters(new URLSearchParams(search)), pinnedRegion),
    [search, pinnedRegion],
  );
  const page = parseSupportPage(new URLSearchParams(search));
  const selectedId = parseSelectedMessage(new URLSearchParams(search));

  // The bare path comes back to the list as it was last left — filters only; the message
  // that was open isn't reopened.
  const memoryScope = `support.${accountId}`;
  const restoreTo = search === '' ? readRememberedSearch(memoryScope) : null;
  const filtersSearch = serializeSupportFilters(filters, 1);

  useEffect(() => {
    if (restoreTo) router.replace(`${pathname}${restoreTo}`, { scroll: false });
    else writeRememberedSearch(memoryScope, filtersSearch);
  }, [restoreTo, filtersSearch, memoryScope, pathname, router]);

  const [isLive, setIsLive] = useState(true);
  const [notice, setNotice] = useState<NoticeValue | null>(null);
  const now = useNow(30_000);
  const { marks, markRead, markAllRead } = useReadMarks(accountId);

  // The Unread list is asked with the marks as they were when it was opened, so reading a
  // message doesn't pull it out of the list under the cursor. Re-taken on refresh and on
  // "Mark all as read".
  const [snapshot, setSnapshot] = useState<ReadMarks | null>(null);
  if (filters.unread && snapshot === null && marks.since > 0) setSnapshot(marks);
  if (!filters.unread && snapshot !== null) setSnapshot(null);

  const listQuery = useSupportMessages(filters, page, snapshot, isLive, !restoreTo);
  const unreadQuery = useSupportUnreadCount(filters, marks, isLive, !restoreTo);
  const citiesQuery = useCities();

  const hrefWith = useCallback(
    (next: SupportFilters, nextPage: number, id = '') => `${pathname}${serializeSupportFilters(next, nextPage, id)}`,
    [pathname],
  );
  // Remembered before navigating — see DriversScreen.
  const navigate = useCallback(
    (next: SupportFilters, nextPage: number, id = '') => {
      writeRememberedSearch(memoryScope, serializeSupportFilters(next, 1));
      router.replace(hrefWith(next, nextPage, id), { scroll: false });
    },
    [hrefWith, memoryScope, router],
  );
  const applyFilters = useCallback(
    (patch: Partial<SupportFilters>) => navigate({ ...filters, ...patch }, 1, selectedId),
    [filters, navigate, selectedId],
  );
  const resetFilters = useCallback(
    () => navigate(confineSupportToRegion({ ...emptySupportFilters(), unread: filters.unread }, pinnedRegion), 1, selectedId),
    [filters.unread, navigate, pinnedRegion, selectedId],
  );
  const hrefFor = useCallback((id: string) => hrefWith(filters, page, id), [filters, hrefWith, page]);

  const rows = useMemo(() => listQuery.data?.results ?? [], [listQuery.data]);
  const total = listQuery.data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / SUPPORT_PAGE_SIZE));
  const selectedIndex = rows.findIndex((row) => row.objectId === selectedId);
  const newerHref = selectedIndex > 0 ? hrefFor(rows[selectedIndex - 1].objectId) : null;
  const olderHref =
    selectedIndex >= 0 && selectedIndex < rows.length - 1 ? hrefFor(rows[selectedIndex + 1].objectId) : null;

  // J and K step through the page, as in every mail client. Ignored while typing or with a
  // dialog open, and with any modifier held so browser shortcuts still work.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== 'j' && key !== 'k') return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if (rows.length === 0) return;
      const index = selectedIndex === -1 ? (key === 'j' ? -1 : rows.length) : selectedIndex;
      const next = rows[key === 'j' ? index + 1 : index - 1];
      if (!next) return;
      event.preventDefault();
      router.replace(hrefFor(next.objectId), { scroll: false });
      document.querySelector(`[data-message-id="${next.objectId}"]`)?.scrollIntoView({ block: 'nearest' });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [hrefFor, router, rows, selectedIndex]);

  const cityNames = useMemo(
    () => new Map((citiesQuery.data ?? []).map((city) => [city.objectId, city.name ?? city.objectId])),
    [citiesQuery.data],
  );
  const regionOptions: SelectOption[] = pinnedRegion
    ? [{ value: pinnedRegion, label: cityNames.get(pinnedRegion) ?? pinnedRegion }]
    : [
        { value: '', label: t('orders.filters.anyRegion') },
        ...(citiesQuery.data ?? []).map((city) => ({ value: city.objectId, label: city.name ?? city.objectId })),
      ];
  const appOptions: SelectOption[] = [
    { value: '', label: t('support.filters.anyApp') },
    ...SENDER_APPS.map((app) => ({ value: app, label: t(SENDER_APP_LABEL_KEY[app]) })),
  ];

  const unreadCount = unreadQuery.data;
  const viewOptions: { key: View; label: string }[] = [
    { key: 'all', label: t('support.views.all') },
    {
      key: 'unread',
      label: unreadCount ? t('support.views.unreadCount', { count: format.number(unreadCount) }) : t('support.views.unread'),
    },
  ];

  const activeCount = activeSupportFilterCount(filters, pinnedRegion);
  const hasFilters = activeCount > 0;
  const onOpened = useCallback((id: string) => markRead(id), [markRead]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        eyebrow={t('support.eyebrow')}
        title={t('support.title')}
        description={t('support.subtitle')}
        actions={
          <LiveControl
            isLive={isLive}
            onToggle={() => setIsLive((current) => !current)}
            onRefresh={() => {
              if (filters.unread) setSnapshot(marks);
              void listQuery.refetch();
              void unreadQuery.refetch();
            }}
            isFetching={listQuery.isFetching}
            updatedAt={listQuery.dataUpdatedAt}
            now={now}
          />
        }
      />

      {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}

      <section className="border-border/70 bg-surface rounded-card shadow-card border">
        <SearchBox
          query={filters.query}
          field={filters.field}
          fields={SUPPORT_SEARCH_FIELDS.map((field) => ({ value: field, label: t(SEARCH_FIELD_LABEL_KEY[field]) }))}
          placeholder={t('support.filters.searchPlaceholder')}
          onFieldChange={(field) => applyFilters({ field: field as SupportSearchField })}
          onSubmit={(query) => applyFilters({ query })}
        />

        <div className="flex flex-col gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-micro text-muted font-bold tracking-[0.1em] uppercase">{t('support.views.label')}</span>
              <SegmentedControl
                label={t('support.views.label')}
                options={viewOptions}
                value={filters.unread ? 'unread' : 'all'}
                onChange={(view) => applyFilters({ unread: view === 'unread' })}
              />
            </div>

            <SelectField
              label={t('orders.filters.region')}
              value={filters.region}
              options={regionOptions}
              isDisabled={pinnedRegion.length > 0}
              onChange={(regionId) => applyFilters({ region: regionId })}
              className="w-44"
            />

            <SelectField
              label={t('support.filters.app')}
              value={filters.app}
              options={appOptions}
              onChange={(app) => applyFilters({ app: app as SenderApp | '' })}
              className="w-44"
            />

            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-micro text-muted font-bold tracking-[0.1em] uppercase">{t('support.filters.period')}</span>
              <div className="max-w-full overflow-x-auto">
                <SegmentedControl
                  label={t('support.filters.period')}
                  options={SUPPORT_RANGES.map((range) => ({ key: range, label: t(RANGE_LABEL_KEY[range]) }))}
                  value={filters.range.preset as SupportRange}
                  onChange={(range) => applyFilters({ range: resolveRange(range) })}
                />
              </div>
            </div>

            {hasFilters && (
              <Button variant="ghost" size="sm" onPress={resetFilters} className="h-9">
                {t('orders.filters.reset')} · {activeCount}
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              className="h-9 sm:ms-auto"
              isDisabled={!unreadCount}
              onPress={() => {
                markAllRead();
                if (filters.unread) setSnapshot(null);
              }}
            >
              <CheckIcon aria-hidden className="size-4" />
              {t('support.filters.markAllRead')}
            </Button>
          </div>

          <p className="text-caption text-faint">
            {pinnedRegion && `${t('support.filters.regionLocked')} `}
            {t('support.filters.readHint')}
          </p>
        </div>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* Below `lg` there is room for one column, so an open message takes the list's place. */}
        <div className={selectedId ? 'hidden lg:block' : ''}>
          <PagedList
            status={listQuery.status}
            error={listQuery.error}
            isPlaceholderData={listQuery.isPlaceholderData}
            isFetching={listQuery.isFetching}
            page={Math.min(page, totalPages)}
            pageSize={SUPPORT_PAGE_SIZE}
            total={total}
            rowCount={rows.length}
            errorTitle={t('support.list.error')}
            onRetry={() => void listQuery.refetch()}
            onPageChange={(nextPage) => navigate(filters, nextPage, selectedId)}
            empty={
              <ListEmpty
                title={t('support.list.emptyTitle')}
                body={
                  hasFilters
                    ? t('support.list.emptyFiltered')
                    : filters.unread
                      ? t('support.list.emptyUnread')
                      : t('support.list.emptyBody')
                }
                actions={
                  hasFilters ? (
                    <Button variant="secondary" size="sm" onPress={resetFilters}>
                      {t('orders.empty.clear')}
                    </Button>
                  ) : undefined
                }
              />
            }
          >
            {rows.map((message) => (
              <MessageRow
                key={message.objectId}
                message={message}
                href={hrefFor(message.objectId)}
                isSelected={message.objectId === selectedId}
                isUnread={isUnread(marks, message)}
                now={now}
              />
            ))}
          </PagedList>
          {rows.length > 1 && <p className="text-micro text-faint mt-2 hidden px-1 lg:block">{t('support.list.keyboardHint')}</p>}
        </div>

        <div className={(selectedId ? '' : 'hidden lg:block ') + 'lg:sticky lg:top-24'}>
          {selectedId ? (
            <MessageReader
              key={selectedId}
              id={selectedId}
              fromList={selectedIndex >= 0 ? rows[selectedIndex] : undefined}
              pinnedRegion={pinnedRegion}
              cityNames={cityNames}
              now={now}
              hrefFor={hrefFor}
              newerHref={newerHref}
              olderHref={olderHref}
              onBack={() => navigate(filters, page)}
              onOpened={onOpened}
              onDeleted={(text) => {
                setNotice({ kind: 'success', title: text });
                const next = rows[selectedIndex + 1] ?? rows[selectedIndex - 1];
                navigate(filters, page, next && next.objectId !== selectedId ? next.objectId : '');
              }}
            />
          ) : (
            <ReaderPlaceholder />
          )}
        </div>
      </div>
    </div>
  );
}
