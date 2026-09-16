'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@heroui/react';
import { useAccess } from '@/hooks/use-access';
import { useDeleteRestaurant, useSetRestaurantActive, useSetRestaurantEnabled } from '@/hooks/use-restaurants';
import { useI18n } from '@/lib/i18n/provider';
import { parseErrorKey } from '@/lib/parse/errors';
import { editRestaurantHref, RESTAURANTS_PATH } from '@/lib/url/restaurant-filters';
import type { RestaurantRow } from '@/types/restaurant';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Notice, type NoticeValue } from '@/components/ui/notice';
import { RowMenu, type RowMenuItem } from '@/components/ui/row-menu';
import { CopyIcon, PauseIcon, PencilIcon, PlayIcon, PowerIcon, TrashIcon, UserIcon } from '@/components/icons';
import { AssignManagerDialog } from './assign-manager-dialog';
import { DuplicateRestaurantDialog } from './duplicate-restaurant-dialog';

/**
 * Everything ops can do to a restaurant, in two shapes: a row's (Pause or Resume, and the
 * rest behind one button) and the restaurant page's header (all of them, spelled out).
 *
 * Each asks before it goes, except Resume — putting a paused restaurant back on sale is
 * what the button says and is undone by the one next to it. Pause is asked about because
 * during service it silently stops a kitchen's orders.
 */

type Dialog = 'pause' | 'enable' | 'disable' | 'manager' | 'duplicate' | 'delete' | null;

export function RestaurantActions({
  restaurant,
  variant,
  onNotice,
}: {
  restaurant: RestaurantRow;
  variant: 'row' | 'header';
  /** Where an outcome is reported. A row passes its own, so the banner spans the row
   * instead of squeezing into the column the buttons sit in. */
  onNotice?: (notice: NoticeValue | null) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const { role } = useAccess();
  const isAdmin = role === 'admin';
  const [dialog, setDialog] = useState<Dialog>(null);
  const [localNotice, setLocalNotice] = useState<NoticeValue | null>(null);
  const setNotice = onNotice ?? setLocalNotice;

  const setActive = useSetRestaurantActive();
  const setEnabled = useSetRestaurantEnabled();
  const remove = useDeleteRestaurant();

  const name = restaurant.name ?? t('common.none');
  const isActive = restaurant.active === true;
  const isEnabled = restaurant.enabled === true;

  const open = (next: Dialog) => {
    setNotice(null);
    setActive.reset();
    setEnabled.reset();
    remove.reset();
    setDialog(next);
  };

  const fail = (titleKey: 'catalogue.actions.pauseFailed' | 'catalogue.actions.resumeFailed', error: unknown) =>
    setNotice({ kind: 'error', title: t(titleKey, { restaurant: name }), body: t(parseErrorKey(error, 'catalogue')) });

  const resume = () => {
    setNotice(null);
    setActive.mutate(
      { id: restaurant.objectId, active: true },
      {
        onSuccess: () => setNotice({ kind: 'success', title: t('catalogue.actions.resumed', { restaurant: name }) }),
        onError: (error) => fail('catalogue.actions.resumeFailed', error),
      },
    );
  };

  const pauseButton = isActive ? (
    <Button variant="secondary" size="sm" onPress={() => open('pause')} isDisabled={setActive.isPending}>
      <PauseIcon aria-hidden className="size-4" />
      {t('catalogue.actions.pause')}
    </Button>
  ) : (
    <Button variant="secondary" size="sm" onPress={resume} isPending={setActive.isPending}>
      {!setActive.isPending && <PlayIcon aria-hidden className="size-4" />}
      {t('catalogue.actions.resume')}
    </Button>
  );

  const items: RowMenuItem[] = [
    {
      key: 'edit',
      label: t('catalogue.actions.edit'),
      icon: <PencilIcon className="size-4" />,
      onPress: () => router.push(editRestaurantHref(restaurant.objectId)),
    },
    {
      key: 'manager',
      label: t('catalogue.actions.manager'),
      icon: <UserIcon className="size-4" />,
      onPress: () => open('manager'),
    },
    {
      key: 'duplicate',
      label: t('catalogue.duplicate.action'),
      icon: <CopyIcon className="size-4" />,
      onPress: () => open('duplicate'),
    },
    {
      key: 'enabled',
      label: t(isEnabled ? 'catalogue.actions.disable' : 'catalogue.actions.enable'),
      icon: <PowerIcon className="size-4" />,
      onPress: () => open(isEnabled ? 'disable' : 'enable'),
      isDanger: isEnabled,
    },
    ...(isAdmin
      ? [
          {
            key: 'delete',
            label: t('catalogue.actions.delete'),
            icon: <TrashIcon className="size-4" />,
            onPress: () => open('delete'),
            isDanger: true,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col items-stretch gap-2">
      {variant === 'header' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onPress={() => router.push(editRestaurantHref(restaurant.objectId))}>
            <PencilIcon aria-hidden className="size-4" />
            {t('catalogue.actions.edit')}
          </Button>
          {isEnabled && pauseButton}
          <Button variant="secondary" size="sm" onPress={() => open('manager')}>
            <UserIcon aria-hidden className="size-4" />
            {t('catalogue.actions.manager')}
          </Button>
          <Button variant="secondary" size="sm" onPress={() => open('duplicate')}>
            <CopyIcon aria-hidden className="size-4" />
            {t('catalogue.duplicate.action')}
          </Button>
          <Button variant={isEnabled ? 'danger-soft' : 'secondary'} size="sm" onPress={() => open(isEnabled ? 'disable' : 'enable')}>
            <PowerIcon aria-hidden className="size-4" />
            {t(isEnabled ? 'catalogue.actions.disable' : 'catalogue.actions.enable')}
          </Button>
          {isAdmin && (
            <Button variant="danger-soft" size="sm" onPress={() => open('delete')}>
              <TrashIcon aria-hidden className="size-4" />
              {t('catalogue.actions.delete')}
            </Button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-end gap-1.5">
          {/* A disabled restaurant can't be ordered from either way, so Pause would only
              change a switch nobody can see; Enable is the action that matters there. */}
          {isEnabled && pauseButton}
          <RowMenu label={t('catalogue.actions.more', { restaurant: name })} items={items} />
        </div>
      )}

      {localNotice && <Notice notice={localNotice} onDismiss={() => setLocalNotice(null)} />}

      {dialog === 'pause' && (
        <ConfirmDialog
          title={t('catalogue.actions.pauseTitle', { restaurant: name })}
          confirmLabel={t('catalogue.actions.pause')}
          pendingLabel={t('catalogue.actions.pausing')}
          isPending={setActive.isPending}
          error={setActive.isError ? t(parseErrorKey(setActive.error, 'catalogue')) : null}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            setActive.mutate(
              { id: restaurant.objectId, active: false },
              {
                onSuccess: () => {
                  setDialog(null);
                  setNotice({ kind: 'success', title: t('catalogue.actions.paused', { restaurant: name }) });
                },
              },
            )
          }
        >
          <p className="text-body text-muted">{t('catalogue.actions.pauseHint')}</p>
        </ConfirmDialog>
      )}

      {(dialog === 'enable' || dialog === 'disable') && (
        <ConfirmDialog
          title={t(dialog === 'disable' ? 'catalogue.actions.disableTitle' : 'catalogue.actions.enableTitle', {
            restaurant: name,
          })}
          confirmLabel={t(dialog === 'disable' ? 'catalogue.actions.disable' : 'catalogue.actions.enable')}
          pendingLabel={t('catalogue.actions.saving')}
          isDanger={dialog === 'disable'}
          isPending={setEnabled.isPending}
          error={setEnabled.isError ? t(parseErrorKey(setEnabled.error, 'catalogue')) : null}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            setEnabled.mutate(
              { id: restaurant.objectId, enabled: dialog === 'enable' },
              {
                onSuccess: () => {
                  setDialog(null);
                  setNotice({
                    kind: 'success',
                    title: t(dialog === 'disable' ? 'catalogue.actions.disabled' : 'catalogue.actions.enabled', {
                      restaurant: name,
                    }),
                  });
                },
              },
            )
          }
        >
          <p className="text-body text-muted">
            {t(dialog === 'disable' ? 'catalogue.actions.disableHint' : 'catalogue.actions.enableHint')}
          </p>
        </ConfirmDialog>
      )}

      {dialog === 'delete' && isAdmin && (
        <ConfirmDialog
          title={t('catalogue.actions.deleteTitle', { restaurant: name })}
          confirmLabel={t('catalogue.actions.deleteConfirm')}
          pendingLabel={t('catalogue.actions.deleting')}
          isDanger
          confirmText={restaurant.name?.trim() || restaurant.objectId}
          isPending={remove.isPending}
          error={remove.isError ? t(parseErrorKey(remove.error, 'catalogue')) : null}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            remove.mutate(restaurant.objectId, {
              onSuccess: () => {
                setDialog(null);
                if (variant === 'header') router.replace(RESTAURANTS_PATH);
              },
            })
          }
        >
          <p className="text-body">{t('catalogue.actions.deleteHint')}</p>
          <ul className="text-caption text-muted list-disc ps-5">
            <li>{t('catalogue.actions.deleteMenus')}</li>
            <li>
              {restaurant.manager
                ? t('catalogue.actions.deleteManager', {
                    name: restaurant.manager.fullname ?? restaurant.manager.username ?? '',
                  })
                : t('catalogue.actions.deleteNoManager')}
            </li>
            <li>{t('catalogue.actions.deleteReviews')}</li>
          </ul>
          <p className="text-caption bg-warning-soft text-warning-soft-foreground rounded-lg px-2.5 py-1.5 font-bold">
            {t('catalogue.actions.deleteInstead')}
          </p>
        </ConfirmDialog>
      )}

      {dialog === 'duplicate' && <DuplicateRestaurantDialog restaurant={restaurant} onClose={() => setDialog(null)} />}

      {dialog === 'manager' && (
        <AssignManagerDialog
          restaurant={restaurant}
          onClose={() => setDialog(null)}
          onDone={(message) => {
            setDialog(null);
            setNotice({ kind: 'success', title: message });
          }}
        />
      )}
    </div>
  );
}
