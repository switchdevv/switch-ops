'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@heroui/react';
import { useAccess } from '@/hooks/use-access';
import { useRemoveManagerFromRestaurant, useSetManagerEnabled } from '@/hooks/use-managers';
import { pinnedRegionId } from '@/lib/auth/access';
import { useI18n } from '@/lib/i18n/provider';
import type { ManagerView } from '@/lib/ops/managers';
import { parseErrorKey } from '@/lib/parse/errors';
import { managerHref } from '@/lib/url/manager-filters';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Notice, type NoticeValue } from '@/components/ui/notice';
import { RowMenu, type RowMenuItem } from '@/components/ui/row-menu';
import { ArrowRightIcon, KeyIcon, PencilIcon, PowerIcon, SendIcon, ShieldIcon, StoreIcon } from '@/components/icons';
import { AppAccessDialog } from '@/components/accounts/app-access-dialog';
import { DialogWarning } from '@/components/drivers/driver-bits';
import { AssignRestaurantDialog } from './assign-restaurant-dialog';
import { ManagerFormDialog } from './manager-form-dialog';
import { ManagerMessageDialog } from './manager-message-dialog';
import { ManagerPasswordDialog } from './manager-password-dialog';

type Dialog = 'edit' | 'password' | 'message' | 'activate' | 'deactivate' | 'assign' | 'remove' | 'apps' | null;

/**
 * Everything ops can do to a manager, as a row's ⋯ menu or the manager page's header — built
 * like `DriverActions`, with the restaurant added: Assign for an account without one, Remove
 * for one whose restaurant still names them back.
 *
 * A staff or admin account gets none of the writes. A broken link (`missing`, `mismatch`)
 * offers neither restaurant action: `assignManager` would refuse the first and unlink the
 * restaurant's other manager on the second — it is fixed from the restaurant's own page.
 */
export function ManagerActions({
  manager,
  variant,
  onNotice,
}: {
  manager: ManagerView;
  variant: 'row' | 'header';
  onNotice?: (notice: NoticeValue | null) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { region, role } = useAccess();
  const pinnedRegion = pinnedRegionId(region);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [localNotice, setLocalNotice] = useState<NoticeValue | null>(null);
  const setNotice = onNotice ?? setLocalNotice;
  const setEnabled = useSetManagerEnabled();
  const remove = useRemoveManagerFromRestaurant();

  const name = manager.row.fullname ?? manager.row.username ?? t('common.none');
  const isEnabled = manager.row.enabled === true;
  const restaurantName = manager.restaurant?.name ?? '';
  const canAssign = manager.link === 'none';
  const canRemove = manager.link === 'ok';
  // A staff account's apps are an admin's to change — the Staff box is theirs alone.
  const canChangeApps = !manager.isProtected || role === 'admin';
  const appsItem: RowMenuItem[] = canChangeApps
    ? [{ key: 'apps', label: t('appAccess.action'), icon: <ShieldIcon className="size-4" />, onPress: () => open('apps') }]
    : [];

  const open = (next: Dialog) => {
    setNotice(null);
    setEnabled.reset();
    remove.reset();
    setDialog(next);
  };

  const finish = (message: string) => {
    setDialog(null);
    setNotice({ kind: 'success', title: message });
  };

  const restaurantItem: RowMenuItem[] = canAssign
    ? [{ key: 'assign', label: t('managers.actions.assign'), icon: <StoreIcon className="size-4" />, onPress: () => open('assign') }]
    : canRemove
      ? [
          {
            key: 'remove',
            label: t('managers.actions.remove'),
            icon: <StoreIcon className="size-4" />,
            onPress: () => open('remove'),
            isDanger: true,
          },
        ]
      : [];

  const writeItems: RowMenuItem[] = manager.isProtected
    ? []
    : [
        { key: 'edit', label: t('drivers.actions.edit'), icon: <PencilIcon className="size-4" />, onPress: () => open('edit') },
        ...restaurantItem,
        {
          key: 'password',
          label: t('drivers.actions.resetPassword'),
          icon: <KeyIcon className="size-4" />,
          onPress: () => open('password'),
        },
        { key: 'message', label: t('drivers.actions.message'), icon: <SendIcon className="size-4" />, onPress: () => open('message') },
        {
          key: 'enabled',
          label: t(isEnabled ? 'drivers.actions.deactivate' : 'drivers.actions.activate'),
          icon: <PowerIcon className="size-4" />,
          onPress: () => open(isEnabled ? 'deactivate' : 'activate'),
          isDanger: isEnabled,
        },
      ];

  const items: RowMenuItem[] = [
    {
      key: 'view',
      label: t('drivers.actions.view'),
      icon: <ArrowRightIcon className="size-4" />,
      onPress: () => router.push(managerHref(manager.id)),
    },
    ...writeItems,
    ...appsItem,
  ];

  return (
    <div className="flex flex-col items-stretch gap-2">
      {variant === 'header' ? (
        manager.isProtected ? (
          <div className="flex flex-col items-start gap-2">
            <DialogWarning>{t('drivers.actions.protected')}</DialogWarning>
            {canChangeApps && (
              <Button variant="secondary" size="sm" onPress={() => open('apps')}>
                <ShieldIcon aria-hidden className="size-4" />
                {t('appAccess.action')}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onPress={() => open('edit')}>
              <PencilIcon aria-hidden className="size-4" />
              {t('drivers.actions.edit')}
            </Button>
            {canAssign && (
              <Button variant="secondary" size="sm" onPress={() => open('assign')}>
                <StoreIcon aria-hidden className="size-4" />
                {t('managers.actions.assign')}
              </Button>
            )}
            <Button variant="secondary" size="sm" onPress={() => open('message')}>
              <SendIcon aria-hidden className="size-4" />
              {t('drivers.actions.message')}
            </Button>
            <Button variant="secondary" size="sm" onPress={() => open('password')}>
              <KeyIcon aria-hidden className="size-4" />
              {t('drivers.actions.resetPassword')}
            </Button>
            {canRemove && (
              <Button variant="danger-soft" size="sm" onPress={() => open('remove')}>
                <StoreIcon aria-hidden className="size-4" />
                {t('managers.actions.remove')}
              </Button>
            )}
            <Button
              variant={isEnabled ? 'danger-soft' : 'secondary'}
              size="sm"
              onPress={() => open(isEnabled ? 'deactivate' : 'activate')}
            >
              <PowerIcon aria-hidden className="size-4" />
              {t(isEnabled ? 'drivers.actions.deactivate' : 'drivers.actions.activate')}
            </Button>
            <Button variant="ghost" size="sm" onPress={() => open('apps')}>
              <ShieldIcon aria-hidden className="size-4" />
              {t('appAccess.action')}
            </Button>
          </div>
        )
      ) : (
        <div className="flex items-center justify-end">
          <RowMenu label={t('drivers.actions.more', { driver: name })} items={items} />
        </div>
      )}

      {localNotice && <Notice notice={localNotice} onDismiss={() => setLocalNotice(null)} />}

      {dialog === 'edit' && <ManagerFormDialog managerId={manager.id} onClose={() => setDialog(null)} onDone={finish} />}
      {dialog === 'password' && <ManagerPasswordDialog manager={manager} onClose={() => setDialog(null)} onDone={finish} />}
      {dialog === 'message' && <ManagerMessageDialog manager={manager} onClose={() => setDialog(null)} onDone={finish} />}
      {dialog === 'assign' && <AssignRestaurantDialog manager={manager} onClose={() => setDialog(null)} onDone={finish} />}
      {dialog === 'apps' && (
        <AppAccessDialog
          userId={manager.id}
          name={name}
          onClose={() => setDialog(null)}
          onDone={(notice) => {
            setDialog(null);
            setNotice(notice);
          }}
        />
      )}

      {dialog === 'remove' && (
        <ConfirmDialog
          title={t('managers.remove.title', { manager: name, restaurant: restaurantName })}
          confirmLabel={t('managers.actions.remove')}
          pendingLabel={t('drivers.actions.saving')}
          isDanger
          isPending={remove.isPending}
          error={remove.isError ? t(parseErrorKey(remove.error, 'managers')) : null}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            remove.mutate(
              { id: manager.id, pinnedRegion },
              { onSuccess: () => finish(t('managers.remove.done', { manager: name, restaurant: restaurantName })) },
            )
          }
        >
          <ul className="text-caption text-muted flex list-disc flex-col gap-1 ps-5">
            <li>{t('managers.remove.app')}</li>
            <li>{t('managers.remove.restaurant', { restaurant: restaurantName })}</li>
            <li>{t('managers.remove.list')}</li>
          </ul>
        </ConfirmDialog>
      )}

      {(dialog === 'activate' || dialog === 'deactivate') && (
        <ConfirmDialog
          title={t(dialog === 'deactivate' ? 'drivers.actions.deactivateTitle' : 'drivers.actions.activateTitle', {
            driver: name,
          })}
          confirmLabel={t(dialog === 'deactivate' ? 'drivers.actions.deactivate' : 'drivers.actions.activate')}
          pendingLabel={t('drivers.actions.saving')}
          isDanger={dialog === 'deactivate'}
          isPending={setEnabled.isPending}
          error={setEnabled.isError ? t(parseErrorKey(setEnabled.error, 'managers')) : null}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            setEnabled.mutate(
              { id: manager.id, enabled: dialog === 'activate', pinnedRegion },
              {
                onSuccess: () =>
                  finish(
                    t(dialog === 'deactivate' ? 'drivers.actions.deactivated' : 'drivers.actions.activated', {
                      driver: name,
                    }),
                  ),
              },
            )
          }
        >
          {dialog === 'activate' ? (
            <>
              <p className="text-body text-muted">{t('managers.enable.activateHint')}</p>
              {manager.row.managerStore?.objectId && (
                <DialogWarning>
                  {t('managers.enable.activateRestaurant', { restaurant: restaurantName || t('common.none') })}
                </DialogWarning>
              )}
            </>
          ) : (
            <>
              <p className="text-body">{t('managers.enable.deactivateHint')}</p>
              {manager.row.managerStore?.objectId && (
                <DialogWarning>
                  {t('managers.enable.deactivateRestaurant', { restaurant: restaurantName || t('common.none') })}
                </DialogWarning>
              )}
              <p className="text-caption text-muted">{t('drivers.actions.deactivateSignedIn')}</p>
            </>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
