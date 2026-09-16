'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@heroui/react';
import { useMenu } from '@/hooks/use-menus';
import { useDeleteProduct, useDuplicateProduct, useProducts, useSetProductEnabled } from '@/hooks/use-products';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { useI18n } from '@/lib/i18n/provider';
import { parseErrorKey } from '@/lib/parse/errors';
import { PRODUCT_PAGE_SIZE } from '@/lib/services/products';
import {
  ENABLED_STATUSES,
  parseMenuView,
  PRODUCT_SEARCH_FIELDS,
  productHref,
  restaurantHref,
  RESTAURANTS_PATH,
  serializeMenuView,
  type EnabledStatus,
  type MenuView,
  type ProductSearchField,
} from '@/lib/url/restaurant-filters';
import type { CurrencyCode } from '@/types/city';
import type { MenuWithRestaurant, Product } from '@/types/restaurant';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Notice, type NoticeValue } from '@/components/ui/notice';
import { PageHeader } from '@/components/ui/page-header';
import { ListEmpty, PagedList } from '@/components/ui/paged-list';
import { RowMenu } from '@/components/ui/row-menu';
import { SelectField } from '@/components/ui/select-field';
import { CopyIcon, PencilIcon, PlusIcon, PowerIcon, TrashIcon } from '@/components/icons';
import { CatalogueGate } from './catalogue-gate';
import { Breadcrumbs, Tag, Thumb } from './restaurant-bits';
import { SearchBox } from './search-box';

const FIELD_LABEL: Record<ProductSearchField, MessageKey> = {
  name: 'catalogue.search.name',
  objectId: 'catalogue.search.productId',
};

/**
 * One menu's dishes — the dashboard's Products page. `/restaurants/menu?id=`.
 */
export function MenuScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = useMemo(() => parseMenuView(new URLSearchParams(searchParams.toString())), [searchParams]);
  const menuQuery = useMenu(view.id);
  const menu = menuQuery.data;

  const navigate = useCallback(
    (next: MenuView) => router.replace(`${pathname}${serializeMenuView(next)}`, { scroll: false }),
    [pathname, router],
  );

  return (
    <CatalogueGate
      status={view.id ? menuQuery.status : 'success'}
      error={menuQuery.error}
      exists={!!menu?.restaurant}
      regionId={menu?.restaurant?.city?.objectId}
      onRetry={() => void menuQuery.refetch()}
    >
      {menu?.restaurant && <MenuProducts menu={menu} view={view} onNavigate={navigate} />}
    </CatalogueGate>
  );
}

function MenuProducts({
  menu,
  view,
  onNavigate,
}: {
  menu: MenuWithRestaurant;
  view: MenuView;
  onNavigate: (view: MenuView) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const query = useProducts(menu.objectId, view.filters, view.page);
  const [notice, setNotice] = useState<NoticeValue | null>(null);
  const restaurant = menu.restaurant!;
  const currency = restaurant.city?.currency;
  const rows = query.data?.results ?? [];
  const hasFilters = !!(view.filters.query || view.filters.status);

  return (
    <div className="flex flex-col gap-5">
      <Breadcrumbs
        items={[
          { label: t('catalogue.list.title'), href: RESTAURANTS_PATH },
          { label: restaurant.name ?? t('common.none'), href: restaurantHref(restaurant.objectId) },
          { label: menu.name ?? t('common.none') },
        ]}
      />
      <PageHeader
        eyebrow={t('catalogue.products.eyebrow', { restaurant: restaurant.name ?? '' })}
        title={menu.name ?? t('common.none')}
        description={t('catalogue.products.subtitle')}
        actions={
          <Button variant="primary" size="md" onPress={() => router.push(productHref(menu.objectId))}>
            <PlusIcon aria-hidden className="size-4" />
            {t('catalogue.products.add')}
          </Button>
        }
      />

      {menu.enabled !== true && (
        <p className="text-caption bg-warning-soft text-warning-soft-foreground rounded-xl px-3 py-2 font-bold">
          {t('catalogue.products.menuDisabled')}
        </p>
      )}

      <section className="border-border/70 bg-surface rounded-card shadow-card border">
        <SearchBox
          query={view.filters.query}
          field={view.filters.field}
          fields={PRODUCT_SEARCH_FIELDS.map((field) => ({ value: field, label: t(FIELD_LABEL[field]) }))}
          placeholder={t('catalogue.products.searchPlaceholder')}
          onFieldChange={(field) => onNavigate({ ...view, page: 1, filters: { ...view.filters, field: field as ProductSearchField } })}
          onSubmit={(value) => onNavigate({ ...view, page: 1, filters: { ...view.filters, query: value } })}
        />
        <div className="flex flex-wrap items-end gap-3 p-4 sm:p-5">
          <SelectField
            label={t('catalogue.filters.status')}
            value={view.filters.status}
            options={[
              { value: '', label: t('catalogue.filters.anyStatus') },
              ...ENABLED_STATUSES.map((status) => ({ value: status, label: t(`catalogue.enabledStatus.${status}`) })),
            ]}
            onChange={(status) =>
              onNavigate({ ...view, page: 1, filters: { ...view.filters, status: status as EnabledStatus | '' } })
            }
            className="w-44"
          />
        </div>
      </section>

      {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}

      <PagedList
        status={query.status}
        error={query.error}
        isPlaceholderData={query.isPlaceholderData}
        isFetching={query.isFetching}
        page={view.page}
        pageSize={PRODUCT_PAGE_SIZE}
        total={query.data?.count ?? 0}
        rowCount={rows.length}
        errorTitle={t('catalogue.products.error')}
        onRetry={() => void query.refetch()}
        onPageChange={(page) => onNavigate({ ...view, page })}
        empty={
          <ListEmpty
            title={t(hasFilters ? 'catalogue.products.emptyFilteredTitle' : 'catalogue.products.emptyTitle')}
            body={t(hasFilters ? 'catalogue.products.emptyFiltered' : 'catalogue.products.emptyBody')}
            actions={
              hasFilters ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onPress={() => onNavigate({ ...view, page: 1, filters: { query: '', field: 'name', status: '' } })}
                >
                  {t('orders.empty.clear')}
                </Button>
              ) : undefined
            }
          />
        }
      >
        {rows.map((product) => (
          <ProductListRow key={product.objectId} product={product} menuId={menu.objectId} currency={currency} onNotice={setNotice} />
        ))}
      </PagedList>
    </div>
  );
}

type ProductDialog = 'enable' | 'disable' | 'duplicate' | 'delete' | null;

function ProductListRow({
  product,
  menuId,
  currency,
  onNotice,
}: {
  product: Product;
  menuId: string;
  currency: CurrencyCode | undefined;
  onNotice: (notice: NoticeValue | null) => void;
}) {
  const { t, tCount, format } = useI18n();
  const router = useRouter();
  const [dialog, setDialog] = useState<ProductDialog>(null);
  const setEnabled = useSetProductEnabled();
  const duplicate = useDuplicateProduct();
  const remove = useDeleteProduct();
  const name = product.name ?? t('common.none');
  const isEnabled = product.enabled !== false;
  const hasDiscount = !!product.discountPrice && product.discountPrice < (product.price ?? 0);
  const editHref = productHref(menuId, product.objectId);

  const open = (next: ProductDialog) => {
    onNotice(null);
    setEnabled.reset();
    duplicate.reset();
    remove.reset();
    setDialog(next);
  };

  const extras = [
    (product.variants?.length ?? 0) > 0 ? tCount('catalogue.products.variants', product.variants!.length) : null,
    (product.instructions?.length ?? 0) > 0 ? tCount('catalogue.products.supplements', product.instructions!.length) : null,
  ].filter(Boolean);

  return (
    <li className="border-separator/70 flex items-center gap-3 border-b px-3 py-3 last:border-b-0 sm:px-4">
      <Thumb picture={product.picture} name={product.name} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href={editHref}
            className="text-body hover:text-link focus-visible:ring-focus truncate rounded font-bold outline-none focus-visible:ring-2"
          >
            {name}
          </Link>
          {!isEnabled && <Tag tone="danger">{t('catalogue.enabledStatus.disabled')}</Tag>}
          {hasDiscount && <Tag tone="accent">{t('catalogue.products.discounted')}</Tag>}
        </span>
        {product.description && <span className="text-caption text-muted truncate">{product.description}</span>}
        {extras.length > 0 && <span className="text-caption text-faint">{extras.join(' · ')}</span>}
      </div>

      <span className="flex shrink-0 flex-col items-end leading-tight">
        <span className="text-body tabular font-bold">
          {format.money(hasDiscount ? product.discountPrice : product.price, currency)}
        </span>
        {hasDiscount && (
          <span className="text-caption text-faint tabular line-through">{format.money(product.price, currency)}</span>
        )}
      </span>

      <RowMenu
        label={t('catalogue.products.more', { product: name })}
        items={[
          { key: 'edit', icon: <PencilIcon className="size-4" />, label: t('catalogue.actions.edit'), onPress: () => router.push(editHref) },
          {
            key: 'enabled',
            icon: <PowerIcon className="size-4" />,
            label: t(isEnabled ? 'catalogue.actions.disable' : 'catalogue.actions.enable'),
            onPress: () => open(isEnabled ? 'disable' : 'enable'),
            isDanger: isEnabled,
          },
          { key: 'duplicate', icon: <CopyIcon className="size-4" />, label: t('catalogue.products.duplicate'), onPress: () => open('duplicate') },
          { key: 'delete', icon: <TrashIcon className="size-4" />, label: t('catalogue.actions.delete'), onPress: () => open('delete'), isDanger: true },
        ]}
      />

      {(dialog === 'enable' || dialog === 'disable') && (
        <ConfirmDialog
          title={t(dialog === 'disable' ? 'catalogue.products.disableTitle' : 'catalogue.products.enableTitle', { product: name })}
          confirmLabel={t(dialog === 'disable' ? 'catalogue.actions.disable' : 'catalogue.actions.enable')}
          pendingLabel={t('catalogue.actions.saving')}
          isDanger={dialog === 'disable'}
          isPending={setEnabled.isPending}
          error={setEnabled.isError ? t(parseErrorKey(setEnabled.error, 'catalogue')) : null}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            setEnabled.mutate(
              { id: product.objectId, enabled: dialog === 'enable' },
              {
                onSuccess: () => {
                  setDialog(null);
                  onNotice({
                    kind: 'success',
                    title: t(dialog === 'disable' ? 'catalogue.products.disabled' : 'catalogue.products.enabled', { product: name }),
                  });
                },
              },
            )
          }
        >
          <p className="text-body text-muted">
            {t(dialog === 'disable' ? 'catalogue.products.disableHint' : 'catalogue.products.enableHint')}
          </p>
        </ConfirmDialog>
      )}

      {dialog === 'duplicate' && (
        <ConfirmDialog
          title={t('catalogue.products.duplicateTitle', { product: name })}
          confirmLabel={t('catalogue.products.duplicate')}
          pendingLabel={t('catalogue.actions.saving')}
          isPending={duplicate.isPending}
          error={duplicate.isError ? t(parseErrorKey(duplicate.error, 'catalogue')) : null}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            duplicate.mutate(product.objectId, {
              onSuccess: () => {
                setDialog(null);
                onNotice({ kind: 'success', title: t('catalogue.products.duplicated', { product: name }) });
              },
            })
          }
        >
          <p className="text-body text-muted">{t('catalogue.products.duplicateHint')}</p>
        </ConfirmDialog>
      )}

      {dialog === 'delete' && (
        <ConfirmDialog
          title={t('catalogue.products.deleteTitle', { product: name })}
          confirmLabel={t('catalogue.actions.deleteConfirm')}
          pendingLabel={t('catalogue.actions.deleting')}
          isDanger
          isPending={remove.isPending}
          error={remove.isError ? t(parseErrorKey(remove.error, 'catalogue')) : null}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            remove.mutate(product.objectId, {
              onSuccess: () => {
                setDialog(null);
                onNotice({ kind: 'success', title: t('catalogue.products.deleted', { product: name }) });
              },
            })
          }
        >
          <p className="text-body text-muted">{t('catalogue.products.deleteHint')}</p>
        </ConfirmDialog>
      )}
    </li>
  );
}

