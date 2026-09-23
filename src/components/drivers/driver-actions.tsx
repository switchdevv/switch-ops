'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@heroui/react';
import { useAccess } from '@/hooks/use-access';
import { useSetDriverEnabled } from '@/hooks/use-drivers';
import { pinnedRegionId } from '@/lib/auth/access';
import { shortId } from '@/lib/format';
import { useI18n } from '@/lib/i18n/provider';
import type { DriverView } from '@/lib/ops/drivers';
import { parseErrorKey } from '@/lib/parse/errors';
import { driverHref } from '@/lib/url/driver-filters';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Notice, type NoticeValue } from '@/components/ui/notice';
import { RowMenu, type RowMenuItem } from '@/components/ui/row-menu';
import { ArrowRightIcon, KeyIcon, PencilIcon, PowerIcon, SendIcon, ShieldIcon } from '@/components/icons';
import { AppAccessDialog } from '@/components/accounts/app-access-dialog';
import { DialogWarning } from './driver-bits';
import { DriverFormDialog } from './driver-form-dialog';
import { MessageDriverDialog } from './message-driver-dialog';
import { ResetPasswordDialog } from './reset-password-dialog';

type Dialog = 'edit' | 'password' | 'message' | 'activate' | 'deactivate' | 'apps' | null;

/**
 * Everything ops can do to a driver, in two shapes: a row's (everything behind one ⋯) and
 * the driver page's header (all of it, spelled out). Built like `RestaurantActions`.
 *
 * A staff or admin account gets none of the writes, in either shape — see
 * `isProtectedAccount`. The row keeps "View", and the header says why the rest is missing
 * rather than showing buttons that would only be refused.
 *
 * Activating asks too, though it is harmless, because it is the same switch as
 * deactivating and a misclick on the wrong row of a long list is how a driver someone just
 * shut off gets turned back on.
 */
export function DriverActions({
  driver,
  variant,
  onNotice,
}: {
  driver: DriverView;
  variant: 'row' | 'header';
  /** Where an outcome is reported. A row passes its own, so the banner spans the row. */
  onNotice?: (notice: NoticeValue | null) => void;
}) {
  const { t, tCount } = useI18n();
  const router = useRouter();
  const { region, role } = useAccess();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [localNotice, setLocalNotice] = useState<NoticeValue | null>(null);
  const setNotice = onNotice ?? setLocalNotice;
  const setEnabled = useSetDriverEnabled();

  const name = driver.row.fullname ?? driver.row.username ?? t('common.none');
  const isEnabled = driver.row.enabled === true;
  const carrying = driver.orderIds[0];
  // A staff account's apps are an admin's to change — the Staff box is theirs alone.
  const canChangeApps = !driver.isProtected || role === 'admin';
  const appsItem: RowMenuItem[] = canChangeApps
    ? [{ key: 'apps', label: t('appAccess.action'), icon: <ShieldIcon className="size-4" />, onPress: () => open('apps') }]
    : [];

  const open = (next: Dialog) => {
    setNotice(null);
    setEnabled.reset();
    setDialog(next);
  };

  const finish = (message: string) => {
    setDialog(null);
    setNotice({ kind: 'success', title: message });
  };

  const writeItems: RowMenuItem[] = driver.isProtected
    ? []
    : [
        { key: 'edit', label: t('drivers.actions.edit'), icon: <PencilIcon className="size-4" />, onPress: () => open('edit') },
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
      onPress: () => router.push(driverHref(driver.id)),
    },
    ...writeItems,
    ...appsItem,
  ];

  return (
    <div className="flex flex-col items-stretch gap-2">
      {variant === 'header' ? (
        driver.isProtected ? (
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
            <Button variant="secondary" size="sm" onPress={() => open('message')}>
              <SendIcon aria-hidden className="size-4" />
              {t('drivers.actions.message')}
            </Button>
            <Button variant="secondary" size="sm" onPress={() => open('password')}>
              <KeyIcon aria-hidden className="size-4" />
              {t('drivers.actions.resetPassword')}
            </Button>
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

      {dialog === 'edit' && <DriverFormDialog driverId={driver.id} onClose={() => setDialog(null)} onDone={finish} />}
      {dialog === 'password' && <ResetPasswordDialog driver={driver} onClose={() => setDialog(null)} onDone={finish} />}
      {dialog === 'message' && <MessageDriverDialog driver={driver} onClose={() => setDialog(null)} onDone={finish} />}
      {dialog === 'apps' && (
        <AppAccessDialog
          userId={driver.id}
          name={name}
          onClose={() => setDialog(null)}
          onDone={(notice) => {
            setDialog(null);
            setNotice(notice);
          }}
        />
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
          error={setEnabled.isError ? t(parseErrorKey(setEnabled.error, 'drivers')) : null}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            setEnabled.mutate(
              { id: driver.id, enabled: dialog === 'activate', pinnedRegion: pinnedRegionId(region) },
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
            <p className="text-body text-muted">{t('drivers.actions.activateHint')}</p>
          ) : (
            <>
              <p className="text-body">{t('drivers.actions.deactivateHint')}</p>
              <ul className="text-caption text-muted flex list-disc flex-col gap-1 ps-5">
                {carrying && <li>{t('drivers.actions.deactivateDelivering', { order: shortId(carrying) })}</li>}
                {driver.queuedOrderIds.length > 0 && (
                  <li>
                    {tCount('drivers.actions.deactivateQueued', driver.queuedOrderIds.length, {
                      orders: driver.queuedOrderIds.map((orderId) => `#${shortId(orderId)}`).join(', '),
                    })}
                  </li>
                )}
                <li>{t('drivers.actions.deactivateSignedIn')}</li>
              </ul>
            </>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}
