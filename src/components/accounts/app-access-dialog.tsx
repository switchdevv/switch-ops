'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Modal, Spinner } from '@heroui/react';
import { useAppAccessAccount, useSaveAppAccess } from '@/hooks/use-app-access';
import { useActor } from '@/hooks/use-customers';
import { useCities } from '@/hooks/use-cities';
import { useI18n } from '@/lib/i18n/provider';
import {
  accountBlockOf,
  appLockOf,
  changeOf,
  draftFromAccount,
  isEmptyChange,
  planAppAccess,
  type AppAccessAccount,
  type AppAccessDraft,
  type AppAccessField,
  type GrantableApp,
} from '@/lib/ops/app-access';
import { parseErrorKey } from '@/lib/parse/errors';
import { managerHref } from '@/lib/url/manager-filters';
import { CheckboxField, TextField } from '@/components/ui/form-controls';
import { SelectField } from '@/components/ui/select-field';
import type { NoticeValue } from '@/components/ui/notice';
import { AlertIcon } from '@/components/icons';

/**
 * Which Switch apps an account may use — the dashboard's appType checkboxes. Staff is only
 * offered to admins. Reads the account through `getUsers` on open and shows nothing to
 * change until it has it, so the boxes always start from the server's row.
 */
export function AppAccessDialog({
  userId,
  name,
  onClose,
  onDone,
}: {
  userId: string;
  name: string;
  onClose: () => void;
  onDone: (notice: NoticeValue) => void;
}) {
  const { t } = useI18n();
  const actor = useActor();
  const account = useAppAccessAccount(userId);
  const save = useSaveAppAccess();
  const block = account.data !== undefined ? accountBlockOf(account.data, actor) : null;

  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!save.isPending}
      onOpenChange={(isOpen) => {
        if (!isOpen && !save.isPending) onClose();
      }}
    >
      <Modal.Container size="md" scroll="inside">
        <Modal.Dialog>
          {account.isPending ? (
            <Modal.Body className="text-caption text-muted flex flex-row items-center gap-2 py-10">
              <Spinner size="sm" />
              {t('appAccess.loading')}
            </Modal.Body>
          ) : account.isError || block || !account.data ? (
            <>
              <Modal.Header>
                <Modal.Heading>{t('appAccess.loadFailed')}</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <p className="text-body text-muted">
                  {account.isError
                    ? t(parseErrorKey(account.error, 'fetch'))
                    : t(block === 'self' ? 'errors.appAccessSelf' : 'errors.appAccessNotFound')}
                </p>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="ghost" size="sm" onPress={onClose}>
                  {t('appAccess.cancel')}
                </Button>
              </Modal.Footer>
            </>
          ) : (
            <AppAccessForm
              account={account.data}
              name={name}
              save={save}
              onClose={onClose}
              onDone={onDone}
            />
          )}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

const APPS: GrantableApp[] = ['driver', 'manager', 'staff'];

function AppAccessForm({
  account,
  name,
  save,
  onClose,
  onDone,
}: {
  account: AppAccessAccount;
  name: string;
  save: ReturnType<typeof useSaveAppAccess>;
  onClose: () => void;
  onDone: (notice: NoticeValue) => void;
}) {
  const { t } = useI18n();
  const actor = useActor();
  const { data: cities } = useCities();
  const [draft, setDraft] = useState<AppAccessDraft>(() => draftFromAccount(account));
  const [invalid, setInvalid] = useState<AppAccessField | null>(null);
  const set = (patch: Partial<AppAccessDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setInvalid(null);
    save.reset();
  };

  const change = changeOf(account, draft);
  const grantsStaff = change.granted.includes('staff');
  const revokesStaff = change.revoked.includes('staff');
  const revokesDriver = change.revoked.includes('driver');
  const grantsManager = change.granted.includes('manager');
  // Asked for only when the account has none: `editUser` won't save without them.
  const asksPhone = !account.phone;
  const asksRegion = !account.regionId;

  const description = (app: GrantableApp): string => {
    const lock = appLockOf(app, account, actor);
    if (lock === 'restaurant') return t('appAccess.apps.managerLocked', { restaurant: account.managerStore?.name || t('common.none') });
    return t(`appAccess.apps.${app}Hint`);
  };

  return (
    <form
      className="flex min-h-0 flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        const result = planAppAccess(account, draft);
        if (!result.ok) {
          setInvalid(result.field);
          return;
        }
        save.mutate(
          { shown: account, plan: result.plan },
          {
            onSuccess: ({ opsGrantFailed }) =>
              onDone({
                kind: 'success',
                title: t('appAccess.saved', { name }),
                body: opsGrantFailed ? t('appAccess.opsGrantFailed') : undefined,
              }),
          },
        );
      }}
    >
      <Modal.Header>
        <Modal.Heading>{t('appAccess.title', { name })}</Modal.Heading>
        <p className="text-caption text-muted">{t('appAccess.subtitle')}</p>
      </Modal.Header>

      <Modal.Body className="flex flex-col gap-3">
        {APPS.filter((app) => app !== 'staff' || actor.role === 'admin').map((app) => (
          <CheckboxField
            key={app}
            label={t(`appAccess.apps.${app}`)}
            description={description(app)}
            isChecked={draft[app]}
            isDisabled={appLockOf(app, account, actor) !== null || save.isPending}
            onChange={(checked) => set({ [app]: checked })}
          />
        ))}
        <p className="text-caption text-muted">{t('appAccess.customerNote')}</p>

        {appLockOf('manager', account, actor) === 'restaurant' && (
          <Link href={managerHref(account.objectId)} className="text-caption text-accent font-bold hover:underline">
            {t('appAccess.openManager')}
          </Link>
        )}

        {grantsStaff && (
          <CheckboxField
            label={t('appAccess.opsAccess')}
            description={t('appAccess.opsAccessHint')}
            isChecked={draft.opsAccess}
            isDisabled={save.isPending}
            onChange={(opsAccess) => set({ opsAccess })}
          />
        )}

        {grantsManager && <Callout>{t('appAccess.grantManager')}</Callout>}
        {revokesDriver && <Callout>{t('appAccess.revokeDriver')}</Callout>}
        {revokesStaff && <Callout>{t('appAccess.revokeStaff')}</Callout>}

        {!isEmptyChange(change) && (asksPhone || asksRegion) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {asksPhone && (
              <TextField
                label={t('appAccess.phone')}
                value={draft.phone}
                onChange={(phone) => set({ phone })}
                error={invalid === 'phone' ? t('appAccess.errors.phone') : null}
                hint={t('appAccess.phoneHint')}
                isRequired
                type="tel"
                inputMode="tel"
                autoComplete="off"
                className="tabular"
              />
            )}
            {asksRegion && (
              <div className="flex flex-col gap-1">
                <SelectField
                  label={t('appAccess.region')}
                  value={draft.regionId}
                  options={[
                    { value: '', label: t('appAccess.chooseRegion') },
                    ...(cities ?? []).map((city) => ({ value: city.objectId, label: city.name ?? city.objectId })),
                  ]}
                  onChange={(regionId) => set({ regionId })}
                />
                {invalid === 'region' && <p className="text-micro text-danger">{t('appAccess.errors.region')}</p>}
              </div>
            )}
          </div>
        )}

        {invalid === 'profile' && <ErrorLine>{t('appAccess.errors.profile')}</ErrorLine>}
        {save.isError && <ErrorLine>{t(parseErrorKey(save.error, 'appAccess'))}</ErrorLine>}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="ghost" size="sm" isDisabled={save.isPending} onPress={onClose}>
          {t('appAccess.cancel')}
        </Button>
        <Button type="submit" variant="primary" size="sm" isPending={save.isPending} isDisabled={isEmptyChange(change)}>
          {t(save.isPending ? 'appAccess.saving' : 'appAccess.save')}
        </Button>
      </Modal.Footer>
    </form>
  );
}

function Callout({ children }: { children: string }) {
  return (
    <p className="text-caption bg-warning-soft text-warning-soft-foreground rounded-lg px-2.5 py-1.5 font-bold">{children}</p>
  );
}

function ErrorLine({ children }: { children: string }) {
  return (
    <div role="alert" className="bg-danger-soft text-danger-soft-foreground flex items-start gap-2 rounded-xl p-2.5">
      <AlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p className="text-caption">{children}</p>
    </div>
  );
}
