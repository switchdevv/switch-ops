'use client';

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Chip, Skeleton } from '@heroui/react';
import { useAccess } from '@/hooks/use-access';
import { useCities } from '@/hooks/use-cities';
import { useCustomerAccount, useCustomerAddresses, useCustomerOrders, useCustomerOrderStats } from '@/hooks/use-customers';
import { useNow } from '@/hooks/use-now';
import { useSession } from '@/hooks/use-session';
import { pinnedRegionId } from '@/lib/auth/access';
import { splitPhones } from '@/lib/format';
import { usePageInRange } from '@/hooks/use-page-in-range';
import { useI18n } from '@/lib/i18n/provider';
import { customerStatusOf, isStaffTagged } from '@/lib/ops/customers';
import { toLatLng } from '@/lib/ops/dispatch';
import { parseErrorKey } from '@/lib/parse/errors';
import { CUSTOMER_ORDERS_PAGE_SIZE } from '@/lib/services/customers';
import { CUSTOMERS_PATH, parseCustomerView, serializeCustomerView, type CustomerView } from '@/lib/url/customer-filters';
import { ordersHref } from '@/lib/url/order-filters';
import { restaurantHref } from '@/lib/url/restaurant-filters';
import type { CustomerAccount, CustomerAddress, CustomerOrderStats } from '@/types/customer';
import { CopyValue } from '@/components/ui/copy-value';
import { ListEmpty, PagedList } from '@/components/ui/paged-list';
import { DriverAvatar } from '@/components/drivers/driver-bits';
import { Breadcrumbs, Tag } from '@/components/restaurants/restaurant-bits';
import { OrderRowItem } from '@/components/orders/order-row';
import { ExternalLinkIcon, InboxIcon, MailIcon, MapPinIcon, PhoneIcon } from '@/components/icons';
import { CustomerActions } from './customer-actions';

/**
 * One customer: who they are and how to reach them, what ops can do to the account, what
 * they have in the app right now, where they get delivered, and every order they have
 * placed — each one expanding into the board's own detail, with the board's actions.
 *
 * The account is read through `getUsers`, the only read that has their email, cart and
 * promo history. A staff account only sees a customer in its own region, and never a staff
 * account; anything else answers as not found.
 */
export function CustomerDetailScreen() {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = useMemo(() => parseCustomerView(new URLSearchParams(searchParams.toString())), [searchParams]);
  const { region, role } = useAccess();
  const pinned = pinnedRegionId(region);
  const query = useCustomerAccount(view.id);
  const account = query.data;

  const navigate = useCallback(
    (next: CustomerView) => router.replace(`${pathname}${serializeCustomerView(next)}`, { scroll: false }),
    [pathname, router],
  );

  if (view.id && query.isPending) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-4 w-48 rounded-md" />
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <Alert status="danger">
        <Alert.Content>
          <Alert.Title>{t('customers.gate.errorTitle')}</Alert.Title>
          <Alert.Description>{t(parseErrorKey(query.error, 'fetch'))}</Alert.Description>
        </Alert.Content>
        <Button variant="secondary" size="sm" onPress={() => void query.refetch()}>
          {t('common.retry')}
        </Button>
      </Alert>
    );
  }

  const isHidden =
    !account || (pinned && account.regionId !== pinned) || (isStaffTagged(account) && role !== 'admin');

  if (isHidden) {
    return (
      <div className="border-border/70 bg-surface rounded-card shadow-card flex flex-col items-center gap-2 border px-6 py-16 text-center">
        <span className="bg-surface-secondary text-muted mb-2 grid size-12 place-items-center rounded-2xl">
          <InboxIcon className="size-6" />
        </span>
        <p className="text-h6 font-bold">{t('customers.gate.notFoundTitle')}</p>
        <p className="text-muted text-body max-w-prose">{t('customers.gate.notFoundBody')}</p>
        <Link href={CUSTOMERS_PATH} className="text-body text-link mt-2 font-bold hover:underline">
          {t('customers.gate.back')}
        </Link>
      </div>
    );
  }

  return <CustomerDetail account={account} view={view} pinnedRegion={pinned} onNavigate={navigate} />;
}

function CustomerDetail({
  account,
  view,
  pinnedRegion,
  onNavigate,
}: {
  account: CustomerAccount;
  view: CustomerView;
  pinnedRegion: string;
  onNavigate: (view: CustomerView) => void;
}) {
  const { t, format } = useI18n();
  const { data: user } = useSession();
  const cities = useCities();
  const status = customerStatusOf(account);
  const name = account.fullname || account.username || account.objectId;
  const regionName = cities.data?.find((city) => city.objectId === account.regionId)?.name;
  const phones = splitPhones(account.phone);

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs items={[{ label: t('customers.list.title'), href: CUSTOMERS_PATH }, { label: name }]} />

      <header className="border-border/70 bg-surface rounded-card shadow-card flex flex-col gap-4 border p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <DriverAvatar
            picture={account.pictureUrl ? { __type: 'File', url: account.pictureUrl, name: '' } : undefined}
            name={account.fullname ?? account.username}
            className="text-h5 size-20"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-h3 min-w-0 font-bold tracking-tight break-words">{name}</h1>
              <Chip color={status === 'enabled' ? 'success' : 'danger'} variant="soft" size="md" className="gap-1.5 ps-2">
                <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
                <Chip.Label>{t(status === 'enabled' ? 'customers.status.enabled' : 'customers.status.disabled')}</Chip.Label>
              </Chip>
              {user?.id === account.objectId && <Tag tone="accent">{t('customers.row.you')}</Tag>}
              {isStaffTagged(account) && <Tag tone="warning">{t('customers.row.staffAccount')}</Tag>}
              {account.appType?.includes('driver') && <Tag tone="muted">{t('customers.row.driver')}</Tag>}
              {account.managerStore && <Tag tone="muted">{t('customers.row.manager')}</Tag>}
            </div>
            <div className="text-caption text-muted flex flex-wrap items-center gap-x-4 gap-y-1">
              {account.fullname && account.username && <span className="min-w-0 break-all">@{account.username}</span>}
              {phones[0] && (
                <a href={`tel:${phones[0]}`} className="tabular hover:text-link inline-flex items-center gap-1">
                  <PhoneIcon aria-hidden className="size-3.5" />
                  {phones[0]}
                </a>
              )}
              {account.email && (
                <a href={`mailto:${account.email}`} className="hover:text-link inline-flex min-w-0 items-center gap-1 break-all">
                  <MailIcon aria-hidden className="size-3.5 shrink-0" />
                  {account.email}
                </a>
              )}
              <span className="inline-flex items-center gap-1">
                <MapPinIcon aria-hidden className="size-3.5" />
                {regionName ?? t('customers.row.noRegion')}
              </span>
            </div>
            <p className="text-caption text-faint">
              {t('customers.row.joined', { date: format.date(account.createdAt) })}
            </p>
          </div>
        </div>
        <CustomerActions
          customer={{
            objectId: account.objectId,
            fullname: account.fullname,
            username: account.username,
            enabled: account.enabled,
            staffType: account.staffType,
            appType: account.appType,
            managerStore: account.managerStore
              ? { __type: 'Pointer', className: 'Restaurant', objectId: account.managerStore.objectId }
              : undefined,
          }}
          variant="header"
        />
      </header>

      <SummaryStrip account={account} pinnedRegion={pinnedRegion} />

      <div className="grid items-start gap-5 lg:grid-cols-[3fr_2fr]">
        <Card title={t('customers.detail.profile')}>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <Item label={t('customers.detail.username')}>{account.username ?? t('common.none')}</Item>
            <Item label={t('customers.detail.phone')}>
              {phones.length > 0 ? (
                <span className="flex flex-col">
                  {phones.map((phone) => (
                    <a key={phone} href={`tel:${phone}`} className="tabular hover:text-link w-fit">
                      {phone}
                    </a>
                  ))}
                </span>
              ) : (
                t('common.none')
              )}
            </Item>
            <Item label={t('customers.detail.email')}>
              {account.email ? (
                <a href={`mailto:${account.email}`} className="hover:text-link break-all">
                  {account.email}
                </a>
              ) : (
                t('common.none')
              )}
            </Item>
            <Item label={t('customers.detail.region')}>{regionName ?? t('customers.row.noRegion')}</Item>
            <Item label={t('customers.detail.signIn')}>
              {account.signInProviders.length > 0 ? (
                <span className="flex flex-wrap gap-1.5">
                  {account.signInProviders.map((provider) => (
                    <Tag key={provider} tone="muted">
                      {provider[0].toUpperCase() + provider.slice(1)}
                    </Tag>
                  ))}
                </span>
              ) : (
                t('customers.detail.passwordOnly')
              )}
            </Item>
            {account.managerStore && (
              <Item label={t('customers.detail.manages')}>
                <Link href={restaurantHref(account.managerStore.objectId)} className="text-link font-bold hover:underline">
                  {account.managerStore.name ?? account.managerStore.objectId}
                </Link>
              </Item>
            )}
            <Item label={t('customers.detail.joined')}>{format.dateTime(account.createdAt)}</Item>
            <Item label={t('customers.detail.updated')}>{format.dateTime(account.updatedAt)}</Item>
            <Item label={t('customers.detail.id')}>
              <CopyValue value={account.objectId} prefix="" label={t('orders.detail.copyId')} />
            </Item>
          </dl>
        </Card>

        <AddressesCard account={account} />
      </div>

      <OrderHistory customerId={account.objectId} page={view.page} pinnedRegion={pinnedRegion} onPageChange={(page) => onNavigate({ ...view, page })} />
    </div>
  );
}

/**
 * The numbers ops look for first, in one row: how they order, and what they have in the app
 * right now. The app half arrives with the account; the order half is its own count.
 */
function SummaryStrip({ account, pinnedRegion }: { account: CustomerAccount; pinnedRegion: string }) {
  const { t, format } = useI18n();
  const stats = useCustomerOrderStats(account.objectId, pinnedRegion, true);

  const orderValue = (pick: (data: CustomerOrderStats) => number): ReactNode =>
    stats.data ? format.number(pick(stats.data)) : stats.isError ? '—' : <Skeleton className="my-1 h-5 w-8 rounded-md" />;

  return (
    <section className="border-border/70 bg-surface rounded-card shadow-card overflow-hidden border">
      <dl className="bg-separator/40 grid grid-cols-2 gap-px sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={t('customers.detail.ordersPlaced')}>{orderValue((data) => data.total)}</Stat>
        <Stat label={t('customers.detail.delivered')}>{orderValue((data) => data.delivered)}</Stat>
        <Stat label={t('customers.detail.canceled')}>{orderValue((data) => data.canceled)}</Stat>
        <Stat label={t('customers.detail.inCart')}>{format.number(account.cartCount)}</Stat>
        <Stat label={t('customers.detail.promosUsed')}>{format.number(account.promosUsedCount)}</Stat>
        <Stat label={t('customers.detail.favorites')}>{format.number(account.favoritesCount)}</Stat>
      </dl>
      {stats.isError ? (
        <p className="border-separator/70 text-caption text-danger border-t px-4 py-2">{t('customers.detail.statsError')}</p>
      ) : (
        pinnedRegion && (
          <p className="border-separator/70 text-caption text-faint border-t px-4 py-2">{t('customers.detail.regionOnly')}</p>
        )
      )}
    </section>
  );
}

/**
 * Their saved addresses, the default one first. The default comes with the account read and
 * is shown even when the address list itself can't be read.
 */
function AddressesCard({ account }: { account: CustomerAccount }) {
  const { t } = useI18n();
  const addresses = useCustomerAddresses(account.objectId, true);
  const defaultId = account.address?.objectId;

  const list: CustomerAddress[] = (() => {
    const rows = addresses.data ?? [];
    const rest = rows.filter((row) => row.objectId !== defaultId);
    return account.address ? [account.address, ...rest] : rest;
  })();

  return (
    <Card title={t('customers.detail.addresses')} count={addresses.isPending ? undefined : list.length}>
      {addresses.isError && <p className="text-caption text-danger">{t('customers.detail.addressesError')}</p>}
      {list.length === 0 ? (
        addresses.isPending ? (
          <Skeleton className="h-20 w-full rounded-xl" />
        ) : (
          <p className="text-body text-muted">{t('customers.detail.noAddresses')}</p>
        )
      ) : (
        <ul className="flex flex-col gap-2.5">
          {list.map((address) => {
            const location = toLatLng(address.location);
            return (
              <li key={address.objectId} className="border-border/70 flex gap-3 rounded-xl border p-3">
                <span className="bg-surface-secondary text-muted grid size-8 shrink-0 place-items-center rounded-lg">
                  <MapPinIcon aria-hidden className="size-4" />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body min-w-0 truncate font-bold">{address.name || t('common.none')}</span>
                    {address.objectId === defaultId && <Tag tone="accent">{t('customers.detail.defaultAddress')}</Tag>}
                  </div>
                  <p className="text-caption text-muted break-words whitespace-pre-line">{address.address || t('common.none')}</p>
                  {location ? (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${location.lat},${location.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-caption text-link inline-flex w-fit items-center gap-1 font-bold hover:underline"
                    >
                      {t('customers.detail.openMap')}
                      <ExternalLinkIcon aria-hidden className="size-3.5" />
                    </a>
                  ) : (
                    <span className="text-caption text-danger">{t('customers.detail.noLocation')}</span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function OrderHistory({
  customerId,
  page,
  pinnedRegion,
  onPageChange,
}: {
  customerId: string;
  page: number;
  pinnedRegion: string;
  onPageChange: (page: number) => void;
}) {
  const { t, format } = useI18n();
  const now = useNow();
  const orders = useCustomerOrders(customerId, page, pinnedRegion, true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const rows = orders.data?.results ?? [];
  // A page past the end — a pasted link, or history that shrank since — would say "No orders
  // yet" over orders that exist. Go to the last real page instead.
  usePageInRange({
    page,
    total: orders.data?.count ?? 0,
    pageSize: CUSTOMER_ORDERS_PAGE_SIZE,
    isSettled: orders.status === 'success' && !orders.isPlaceholderData,
    onPageChange,
  });

  // The pager sits under the rows, so a new page would otherwise open at its bottom. An open
  // row belongs to the page it was on, as on the board.
  const changePage = (next: number) => {
    setExpanded(null);
    onPageChange(next);
    headingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <section className="flex flex-col gap-3">
      <div ref={headingRef} className="flex scroll-mt-24 flex-wrap items-center justify-between gap-2">
        <h2 className="text-h5 inline-flex items-center gap-2 font-bold">
          {t('customers.detail.history')}
          {orders.data && <CountBadge count={format.number(orders.data.count)} />}
        </h2>
        <Link href={ordersHref('user', customerId)} className="text-caption text-link inline-flex items-center gap-1 font-bold hover:underline">
          {t('customers.detail.openBoard')}
          <ExternalLinkIcon aria-hidden className="size-3.5" />
        </Link>
      </div>

      <PagedList
        status={orders.status}
        error={orders.error}
        isPlaceholderData={orders.isPlaceholderData}
        isFetching={orders.isFetching}
        page={page}
        pageSize={CUSTOMER_ORDERS_PAGE_SIZE}
        total={orders.data?.count ?? 0}
        rowCount={rows.length}
        errorTitle={t('customers.detail.historyError')}
        onRetry={() => void orders.refetch()}
        onPageChange={changePage}
        empty={<ListEmpty title={t('customers.detail.historyEmpty')} body="" />}
      >
        {rows.map((order) => (
          <OrderRowItem
            key={order.objectId}
            order={order}
            now={now}
            isExpanded={expanded === order.objectId}
            onToggle={() => setExpanded((current) => (current === order.objectId ? null : order.objectId))}
          />
        ))}
      </PagedList>
    </section>
  );
}

function Card({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  const { format } = useI18n();
  return (
    <section className="border-border/70 bg-surface rounded-card shadow-card flex min-w-0 flex-col gap-4 border p-4 sm:p-5">
      <h2 className="text-h6 inline-flex items-center gap-2 font-bold">
        {title}
        {count !== undefined && <CountBadge count={format.number(count)} />}
      </h2>
      {children}
    </section>
  );
}

function CountBadge({ count }: { count: string }) {
  return (
    <span className="bg-surface-tertiary text-muted text-caption tabular rounded-full px-2 py-0.5 font-bold">{count}</span>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-micro text-muted font-bold tracking-[0.1em] uppercase">{label}</dt>
      <dd className="text-body min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="bg-surface flex min-w-0 flex-col gap-0.5 px-4 py-3">
      <dt className="text-micro text-muted truncate font-bold tracking-[0.1em] uppercase">{label}</dt>
      <dd className="text-h5 tabular font-bold">{children}</dd>
    </div>
  );
}
