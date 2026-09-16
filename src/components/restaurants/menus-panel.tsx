'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Modal } from '@heroui/react';
import {
  useCreateMenu,
  useDeleteMenu,
  useDuplicateMenu,
  useMenus,
  useRenameMenu,
  useSetMenuEnabled,
} from '@/hooks/use-menus';
import { useI18n } from '@/lib/i18n/provider';
import { parseErrorKey } from '@/lib/parse/errors';
import { MENU_PAGE_SIZE } from '@/lib/services/menus';
import { ENABLED_STATUSES, menuHref, type EnabledStatus, type MenuFilters } from '@/lib/url/restaurant-filters';
import type { MenuRow, RestaurantRow } from '@/types/restaurant';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CheckboxField, TextField } from '@/components/ui/form-controls';
import { Notice, type NoticeValue } from '@/components/ui/notice';
import { ListEmpty, PagedList } from '@/components/ui/paged-list';
import { RowMenu } from '@/components/ui/row-menu';
import { SelectField } from '@/components/ui/select-field';
import { CopyIcon, MenuBookIcon, PencilIcon, PlusIcon, PowerIcon, TrashIcon } from '@/components/icons';
import { DuplicateDialog } from './duplicate-dialog';
import { Tag } from './restaurant-bits';
import { SearchBox } from './search-box';

/**
 * A restaurant's menus — the dashboard's Lists page, as a tab of the restaurant.
 */
export function MenusPanel({
  restaurant,
  filters,
  page,
  onFiltersChange,
  onPageChange,
}: {
  restaurant: RestaurantRow;
  filters: MenuFilters;
  page: number;
  onFiltersChange: (filters: MenuFilters) => void;
  onPageChange: (page: number) => void;
}) {
  const { t } = useI18n();
  const query = useMenus(restaurant.objectId, filters, page);
  const [isCreating, setIsCreating] = useState(false);
  const [notice, setNotice] = useState<NoticeValue | null>(null);
  const rows = query.data?.results ?? [];
  const hasFilters = !!(filters.query || filters.status);

  return (
    <div className="flex flex-col gap-4">
      <section className="border-border/70 bg-surface rounded-card shadow-card border">
        <SearchBox
          query={filters.query}
          placeholder={t('catalogue.menus.searchPlaceholder')}
          onSubmit={(value) => onFiltersChange({ ...filters, query: value })}
        />
        <div className="flex flex-wrap items-end justify-between gap-3 p-4 sm:p-5">
          <SelectField
            label={t('catalogue.filters.status')}
            value={filters.status}
            options={[
              { value: '', label: t('catalogue.filters.anyStatus') },
              ...ENABLED_STATUSES.map((status) => ({ value: status, label: t(`catalogue.enabledStatus.${status}`) })),
            ]}
            onChange={(status) => onFiltersChange({ ...filters, status: status as EnabledStatus | '' })}
            className="w-44"
          />
          <Button
            variant="primary"
            size="md"
            onPress={() => {
              setNotice(null);
              setIsCreating(true);
            }}
          >
            <PlusIcon aria-hidden className="size-4" />
            {t('catalogue.menus.add')}
          </Button>
        </div>
        <p className="text-caption text-faint px-4 pb-4 sm:px-5">{t('catalogue.menus.orderHint')}</p>
      </section>

      {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}

      <PagedList
        status={query.status}
        error={query.error}
        isPlaceholderData={query.isPlaceholderData}
        isFetching={query.isFetching}
        page={page}
        pageSize={MENU_PAGE_SIZE}
        total={query.data?.count ?? 0}
        rowCount={rows.length}
        errorTitle={t('catalogue.menus.error')}
        onRetry={() => void query.refetch()}
        onPageChange={onPageChange}
        empty={
          <ListEmpty
            title={t(hasFilters ? 'catalogue.menus.emptyFilteredTitle' : 'catalogue.menus.emptyTitle')}
            body={t(hasFilters ? 'catalogue.menus.emptyFiltered' : 'catalogue.menus.emptyBody')}
            actions={
              hasFilters ? (
                <Button variant="secondary" size="sm" onPress={() => onFiltersChange({ query: '', status: '' })}>
                  {t('orders.empty.clear')}
                </Button>
              ) : undefined
            }
          />
        }
      >
        {rows.map((menu) => (
          <MenuListRow key={menu.objectId} menu={menu} restaurant={restaurant} onNotice={setNotice} />
        ))}
      </PagedList>

      {isCreating && (
        <MenuDialog
          restaurant={restaurant}
          onClose={() => setIsCreating(false)}
          onDone={(name) => {
            setIsCreating(false);
            setNotice({ kind: 'success', title: t('catalogue.menus.created', { menu: name }) });
          }}
        />
      )}
    </div>
  );
}

type MenuDialogKind = 'rename' | 'duplicate' | 'enable' | 'disable' | 'delete' | null;

function MenuListRow({
  menu,
  restaurant,
  onNotice,
}: {
  menu: MenuRow;
  restaurant: RestaurantRow;
  onNotice: (notice: NoticeValue | null) => void;
}) {
  const { t, tCount, format } = useI18n();
  const [dialog, setDialog] = useState<MenuDialogKind>(null);
  const setEnabled = useSetMenuEnabled();
  const duplicate = useDuplicateMenu();
  const remove = useDeleteMenu();
  const name = menu.name ?? t('common.none');
  const isEnabled = menu.enabled === true;

  const open = (next: MenuDialogKind) => {
    onNotice(null);
    setEnabled.reset();
    remove.reset();
    setDialog(next);
  };

  return (
    <li className="border-separator/70 flex items-center gap-3 border-b px-3 py-3 last:border-b-0 sm:px-4">
      <span className="bg-surface-secondary text-muted grid size-10 shrink-0 place-items-center rounded-xl">
        <MenuBookIcon className="size-5" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href={menuHref(menu.objectId)}
            className="text-body hover:text-link focus-visible:ring-focus truncate rounded font-bold outline-none focus-visible:ring-2"
          >
            {name}
          </Link>
          {!isEnabled && <Tag tone="danger">{t('catalogue.enabledStatus.disabled')}</Tag>}
        </span>
        <span className="text-caption text-muted">
          {tCount('catalogue.menus.products', menu.productCount)} · {t('catalogue.menus.updated', { date: format.date(menu.updatedAt) })}
        </span>
      </div>

      <Link
        href={menuHref(menu.objectId)}
        className="text-caption text-link hidden font-bold hover:underline sm:inline"
      >
        {t('catalogue.menus.open')}
      </Link>

      <RowMenu
        label={t('catalogue.menus.more', { menu: name })}
        items={[
          { key: 'rename', icon: <PencilIcon className="size-4" />, label: t('catalogue.menus.rename'), onPress: () => open('rename') },
          {
            key: 'duplicate',
            icon: <CopyIcon className="size-4" />,
            label: t('catalogue.duplicate.action'),
            onPress: () => open('duplicate'),
          },
          {
            key: 'enabled',
            icon: <PowerIcon className="size-4" />,
            label: t(isEnabled ? 'catalogue.actions.disable' : 'catalogue.actions.enable'),
            onPress: () => open(isEnabled ? 'disable' : 'enable'),
            isDanger: isEnabled,
          },
          {
            key: 'delete',
            icon: <TrashIcon className="size-4" />,
            label: t('catalogue.actions.delete'),
            onPress: () => open('delete'),
            isDanger: true,
          },
        ]}
      />

      {dialog === 'duplicate' && (
        <DuplicateDialog
          title={t('catalogue.duplicate.menuTitle', { menu: name })}
          hint={tCount('catalogue.duplicate.menuHint', menu.productCount)}
          nameLabel={t('catalogue.menus.name')}
          defaultName={t('catalogue.duplicate.copyName', { name })}
          run={(copyName, onProgress) => duplicate.mutateAsync({ menuId: menu.objectId, name: copyName, onProgress })}
          hrefFor={menuHref}
          openLabel={t('catalogue.duplicate.openMenu')}
          onClose={() => setDialog(null)}
        />
      )}

      {dialog === 'rename' && (
        <MenuDialog
          restaurant={restaurant}
          menu={menu}
          onClose={() => setDialog(null)}
          onDone={(newName) => {
            setDialog(null);
            onNotice({ kind: 'success', title: t('catalogue.menus.renamed', { menu: newName }) });
          }}
        />
      )}

      {(dialog === 'enable' || dialog === 'disable') && (
        <ConfirmDialog
          title={t(dialog === 'disable' ? 'catalogue.menus.disableTitle' : 'catalogue.menus.enableTitle', { menu: name })}
          confirmLabel={t(dialog === 'disable' ? 'catalogue.actions.disable' : 'catalogue.actions.enable')}
          pendingLabel={t('catalogue.actions.saving')}
          isDanger={dialog === 'disable'}
          isPending={setEnabled.isPending}
          error={setEnabled.isError ? t(parseErrorKey(setEnabled.error, 'catalogue')) : null}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            setEnabled.mutate(
              { id: menu.objectId, enabled: dialog === 'enable' },
              {
                onSuccess: () => {
                  setDialog(null);
                  onNotice({
                    kind: 'success',
                    title: t(dialog === 'disable' ? 'catalogue.menus.disabled' : 'catalogue.menus.enabled', { menu: name }),
                  });
                },
              },
            )
          }
        >
          <p className="text-body text-muted">
            {tCount(dialog === 'disable' ? 'catalogue.menus.disableHint' : 'catalogue.menus.enableHint', menu.productCount)}
          </p>
        </ConfirmDialog>
      )}

      {dialog === 'delete' && (
        <ConfirmDialog
          title={t('catalogue.menus.deleteTitle', { menu: name })}
          confirmLabel={t('catalogue.actions.deleteConfirm')}
          pendingLabel={t('catalogue.actions.deleting')}
          isDanger
          confirmText={menu.productCount > 0 ? menu.name?.trim() || menu.objectId : undefined}
          isPending={remove.isPending}
          error={remove.isError ? t(parseErrorKey(remove.error, 'catalogue')) : null}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            remove.mutate(menu.objectId, {
              onSuccess: () => {
                setDialog(null);
                onNotice({ kind: 'success', title: t('catalogue.menus.deleted', { menu: name }) });
              },
            })
          }
        >
          <p className="text-body text-muted">{tCount('catalogue.menus.deleteHint', menu.productCount)}</p>
        </ConfirmDialog>
      )}
    </li>
  );
}

/** Adding a menu, or renaming one. */
function MenuDialog({
  restaurant,
  menu,
  onClose,
  onDone,
}: {
  restaurant: RestaurantRow;
  menu?: MenuRow;
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(menu?.name ?? '');
  const [enabled, setEnabled] = useState(true);
  const [showError, setShowError] = useState(false);
  const create = useCreateMenu();
  const rename = useRenameMenu();
  const mutation = menu ? rename : create;
  const trimmed = name.trim();

  const save = () => {
    if (!trimmed) {
      setShowError(true);
      return;
    }
    if (menu) {
      if (trimmed === menu.name) return onClose();
      rename.mutate({ id: menu.objectId, restaurantId: restaurant.objectId, name: trimmed }, { onSuccess: () => onDone(trimmed) });
    } else {
      create.mutate({ restaurantId: restaurant.objectId, name: trimmed, enabled }, { onSuccess: () => onDone(trimmed) });
    }
  };

  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!mutation.isPending}
      onOpenChange={(isOpen) => {
        if (!isOpen && !mutation.isPending) onClose();
      }}
    >
      <Modal.Container size="sm">
        <Modal.Dialog>
          <form
            className="flex flex-col"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <Modal.Header>
              <Modal.Heading>
                {menu ? t('catalogue.menus.renameTitle', { menu: menu.name ?? '' }) : t('catalogue.menus.addTitle', { restaurant: restaurant.name ?? '' })}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <TextField
                label={t('catalogue.menus.name')}
                value={name}
                onChange={(value) => {
                  setName(value);
                  mutation.reset();
                }}
                error={showError && !trimmed ? t('catalogue.menus.nameRequired') : null}
                placeholder={t('catalogue.menus.namePlaceholder')}
                isRequired
                autoFocus
                maxLength={80}
              />
              {!menu && (
                <CheckboxField
                  label={t('catalogue.form.enabled')}
                  description={t('catalogue.menus.enabledHint')}
                  isChecked={enabled}
                  onChange={setEnabled}
                />
              )}
              {mutation.isError && (
                <p role="alert" className="text-caption text-danger">
                  {t(parseErrorKey(mutation.error, 'catalogue'))}
                </p>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" size="sm" isDisabled={mutation.isPending} onPress={onClose}>
                {t('catalogue.confirm.cancel')}
              </Button>
              <Button type="submit" variant="primary" size="sm" isPending={mutation.isPending}>
                {mutation.isPending ? t('catalogue.actions.saving') : t(menu ? 'catalogue.form.save' : 'catalogue.menus.add')}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
