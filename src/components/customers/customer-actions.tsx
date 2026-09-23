'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Spinner } from '@heroui/react';
import { useActor, useCustomerAccount, useDeleteCustomer, useSetCustomerEnabled } from '@/hooks/use-customers';
import { useI18n } from '@/lib/i18n/provider';
import { deleteBlockOf, manageBlockOf } from '@/lib/ops/customers';
import { parseErrorKey } from '@/lib/parse/errors';
import { customerHref, CUSTOMERS_PATH } from '@/lib/url/customer-filters';
import type { CustomerRow } from '@/types/customer';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Notice, type NoticeValue } from '@/components/ui/notice';
import { RowMenu, type RowMenuItem } from '@/components/ui/row-menu';
import { KeyIcon, PencilIcon, PowerIcon, ShieldIcon, TrashIcon, UserIcon } from '@/components/icons';
import { AppAccessDialog } from '@/components/accounts/app-access-dialog';
import { CustomerFormDialog } from './customer-form-dialog';
import { ResetPasswordDialog } from './reset-password-dialog';

/** What the actions need to know about an account — a list row has it, and so does the
 * detail page's account read once reshaped. */
export type CustomerSubject = Pick<CustomerRow, 'objectId' | 'fullname' | 'username' | 'enabled' | 'staffType' | 'appType' | 'managerStore'>;

type Dialog = 'edit' | 'password' | 'enable' | 'disable' | 'delete' | 'apps' | null;

/**
 * Everything ops can do to a customer account, as a row's ⋯ menu or the detail page's
 * buttons. Every one asks first: each reaches a person who is using the app right now.
 */
export function CustomerActions({
  customer,
  variant,
  onNotice,
}: {
  customer: CustomerSubject;
  variant: 'row' | 'header';
  onNotice?: (notice: NoticeValue | null) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const actor = useActor();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [localNotice, setLocalNotice] = useState<NoticeValue | null>(null);
  const setNotice = onNotice ?? setLocalNotice;

  const setEnabled = useSetCustomerEnabled();
  const remove = useDeleteCustomer();

  const name = customer.fullname || customer.username || customer.objectId;
  const isEnabled = customer.enabled === true;
  const isAdmin = actor.role === 'admin';
  const block = manageBlockOf(customer, actor.role, actor.selfId);

  const open = (next: Dialog) => {
    setNotice(null);
    setEnabled.reset();
    remove.reset();
    setDialog(next);
  };

  const done = (message: string) => {
    setDialog(null);
    setNotice({ kind: 'success', title: message });
  };

  if (block) {
    return variant === 'header' ? (
      <p className="text-caption text-muted">{t(block === 'self' ? 'customers.actions.self' : 'errors.customerNotFound')}</p>
    ) : (
      <Button variant="ghost" size="sm" onPress={() => router.push(customerHref(customer.objectId))}>
        {t('customers.actions.view')}
      </Button>
    );
  }

  const items: RowMenuItem[] = [
    { key: 'view', label: t('customers.actions.view'), icon: <UserIcon className="size-4" />, onPress: () => router.push(customerHref(customer.objectId)) },
    { key: 'edit', label: t('customers.actions.edit'), icon: <PencilIcon className="size-4" />, onPress: () => open('edit') },
    { key: 'password', label: t('customers.actions.resetPassword'), icon: <KeyIcon className="size-4" />, onPress: () => open('password') },
    { key: 'apps', label: t('appAccess.action'), icon: <ShieldIcon className="size-4" />, onPress: () => open('apps') },
    {
      key: 'enabled',
      label: t(isEnabled ? 'customers.actions.disable' : 'customers.actions.enable'),
      icon: <PowerIcon className="size-4" />,
      onPress: () => open(isEnabled ? 'disable' : 'enable'),
      isDanger: isEnabled,
    },
    ...(isAdmin
      ? [{ key: 'delete', label: t('customers.actions.delete'), icon: <TrashIcon className="size-4" />, onPress: () => open('delete'), isDanger: true }]
      : []),
  ];

  return (
    <div className="flex flex-col items-stretch gap-2">
      {variant === 'header' ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" size="sm" onPress={() => open('edit')}>
            <PencilIcon aria-hidden className="size-4" />
            {t('customers.actions.edit')}
          </Button>
          <Button variant="secondary" size="sm" onPress={() => open('password')}>
            <KeyIcon aria-hidden className="size-4" />
            {t('customers.actions.resetPassword')}
          </Button>
          <Button variant="secondary" size="sm" onPress={() => open('apps')}>
            <ShieldIcon aria-hidden className="size-4" />
            {t('appAccess.action')}
          </Button>
          <Button variant={isEnabled ? 'danger-soft' : 'secondary'} size="sm" onPress={() => open(isEnabled ? 'disable' : 'enable')}>
            <PowerIcon aria-hidden className="size-4" />
            {t(isEnabled ? 'customers.actions.disable' : 'customers.actions.enable')}
          </Button>
          {/* Set apart and quieter than Disable: the one action that can't be undone should
              never sit where Disable's twin would be pressed by habit. */}
          {isAdmin && (
            <Button variant="ghost" size="sm" className="text-danger sm:ms-auto" onPress={() => open('delete')}>
              <TrashIcon aria-hidden className="size-4" />
              {t('customers.actions.delete')}
            </Button>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-end">
          <RowMenu label={t('customers.actions.more', { customer: name })} items={items} />
        </div>
      )}

      {localNotice && <Notice notice={localNotice} onDismiss={() => setLocalNotice(null)} />}

      {dialog === 'edit' && (
        <CustomerFormDialog
          mode="edit"
          customerId={customer.objectId}
          onClose={() => setDialog(null)}
          onDone={(saved) => done(t('customers.form.saved', { customer: saved }))}
        />
      )}

      {dialog === 'password' && (
        <ResetPasswordDialog
          customerId={customer.objectId}
          name={name}
          onClose={() => setDialog(null)}
          onDone={() => done(t('customers.password.done', { customer: name }))}
        />
      )}

      {dialog === 'apps' && (
        <AppAccessDialog
          userId={customer.objectId}
          name={name}
          onClose={() => setDialog(null)}
          onDone={(notice) => {
            setDialog(null);
            setNotice(notice);
          }}
        />
      )}

      {(dialog === 'enable' || dialog === 'disable') && (
        <ConfirmDialog
          title={t(dialog === 'disable' ? 'customers.actions.disableTitle' : 'customers.actions.enableTitle', { customer: name })}
          confirmLabel={t(dialog === 'disable' ? 'customers.actions.disable' : 'customers.actions.enable')}
          pendingLabel={t('customers.actions.saving')}
          isDanger={dialog === 'disable'}
          isPending={setEnabled.isPending}
          error={setEnabled.isError ? t(parseErrorKey(setEnabled.error, 'customers')) : null}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            setEnabled.mutate(
              { id: customer.objectId, enabled: dialog === 'enable' },
              {
                onSuccess: () =>
                  done(t(dialog === 'disable' ? 'customers.actions.disabled' : 'customers.actions.enabled', { customer: name })),
              },
            )
          }
        >
          <p className="text-body text-muted">
            {t(dialog === 'disable' ? 'customers.actions.disableHint' : 'customers.actions.enableHint')}
          </p>
          {dialog === 'disable' && <p className="text-caption text-muted">{t('customers.actions.disableSignedIn')}</p>}
          {customer.managerStore && (
            <ManagerWarning
              customerId={customer.objectId}
              messageKey={dialog === 'disable' ? 'customers.actions.disableManager' : 'customers.actions.enableManager'}
            />
          )}
        </ConfirmDialog>
      )}

      {dialog === 'delete' && isAdmin && (
        <ConfirmDialog
          title={t('customers.actions.deleteTitle', { customer: name })}
          confirmLabel={t('customers.actions.deleteConfirm')}
          pendingLabel={t('customers.actions.deleting')}
          isDanger
          confirmText={customer.username?.trim() || customer.objectId}
          isPending={remove.isPending}
          error={remove.isError ? t(parseErrorKey(remove.error, 'customers')) : null}
          onClose={() => setDialog(null)}
          onConfirm={() =>
            remove.mutate(customer.objectId, {
              onSuccess: () => {
                if (variant === 'header') router.replace(CUSTOMERS_PATH);
                done(t('customers.actions.deleted', { customer: name }));
              },
            })
          }
        >
          {deleteBlockOf(customer) ? (
            <ManagerWarning customerId={customer.objectId} messageKey="customers.actions.deleteManagerBlocked" tone="danger" />
          ) : (
            <>
              <p className="text-body">{t('customers.actions.deleteHint')}</p>
              <ul className="text-caption text-muted list-disc ps-5">
                <li>{t('customers.actions.deleteSessions')}</li>
                <li>{t('customers.actions.deleteAddresses')}</li>
              </ul>
              <p className="text-caption text-muted">{t('customers.actions.deleteOrders')}</p>
              <p className="text-caption bg-warning-soft text-warning-soft-foreground rounded-lg px-2.5 py-1.5 font-bold">
                {t('customers.actions.deleteInstead')}
              </p>
            </>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

/**
 * Names the restaurant an account runs. The list row only carries a pointer, so the name
 * comes from the account read — a cloud call, made only when a dialog that needs it opens.
 */
function ManagerWarning({
  customerId,
  messageKey,
  tone = 'warning',
}: {
  customerId: string;
  messageKey: 'customers.actions.disableManager' | 'customers.actions.enableManager' | 'customers.actions.deleteManagerBlocked';
  tone?: 'warning' | 'danger';
}) {
  const { t } = useI18n();
  const account = useCustomerAccount(customerId);
  const restaurant = account.data?.managerStore?.name ?? account.data?.managerStore?.objectId;

  return (
    <p
      className={
        'text-caption flex items-start gap-2 rounded-lg px-2.5 py-1.5 font-bold ' +
        (tone === 'danger' ? 'bg-danger-soft text-danger-soft-foreground' : 'bg-warning-soft text-warning-soft-foreground')
      }
    >
      {account.isPending && <Spinner size="sm" />}
      <span>{t(messageKey, { restaurant: restaurant ?? '…' })}</span>
    </p>
  );
}
