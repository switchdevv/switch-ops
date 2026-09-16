'use client';

import { useState } from 'react';
import { Button, Modal, Spinner } from '@heroui/react';
import { useAccess } from '@/hooks/use-access';
import { useCities } from '@/hooks/use-cities';
import { useCreateManager, useManagerAccount, useUpdateManager } from '@/hooks/use-managers';
import { pinnedRegionId } from '@/lib/auth/access';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { useI18n } from '@/lib/i18n/provider';
import {
  draftFromAccount,
  emptyDriverDraft,
  MIN_PASSWORD_LENGTH,
  validateDriverDraft,
  type DriverDraft,
  type DriverField,
  type DriverFormMode,
  type DriverParams,
} from '@/lib/ops/driver-form';
import { parseErrorKey } from '@/lib/parse/errors';
import { TextField } from '@/components/ui/form-controls';
import { SelectField, type SelectOption } from '@/components/ui/select-field';
import { DialogError } from '@/components/drivers/driver-bits';

/**
 * The rules are the driver form's (lib/ops/driver-form.ts), unchanged: the same `addUser` /
 * `editUser` columns, and the manager app parks an account with no phone on the same phone
 * step (switch-manager navigation/root.js) and shows no orders without a region.
 */
const FIELD_ERROR_KEY: Record<DriverField, MessageKey> = {
  fullname: 'drivers.form.errors.fullname',
  username: 'drivers.form.errors.username',
  password: 'drivers.form.errors.password',
  email: 'drivers.form.errors.email',
  phone: 'drivers.form.errors.phone',
  region: 'drivers.form.errors.region',
};

/**
 * Adding a manager (no `managerId`) or editing one. Editing waits for the fresh `getUsers`
 * read, for the reason `DriverFormDialog` gives. Mount it only while open.
 */
export function ManagerFormDialog({
  managerId,
  onClose,
  onDone,
}: {
  managerId?: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useI18n();
  const { region } = useAccess();
  const pinnedRegion = pinnedRegionId(region);
  const isEdit = !!managerId;

  const account = useManagerAccount(managerId ?? '', isEdit);
  const create = useCreateManager();
  const update = useUpdateManager();
  const isPending = create.isPending || update.isPending;
  const failure = create.error ?? update.error;
  const error = failure ? t(parseErrorKey(failure, 'managers')) : null;

  const save = (params: DriverParams) => {
    if (!managerId) {
      create.mutate(params, { onSuccess: () => onDone(t('managers.form.created', { manager: params.fullname })) });
      return;
    }
    update.mutate(
      { id: managerId, params, pinnedRegion },
      { onSuccess: () => onDone(t('drivers.form.saved', { driver: params.fullname })) },
    );
  };

  const body = (() => {
    if (!isEdit) {
      return (
        <ManagerFormBody
          mode="add"
          initial={emptyDriverDraft(pinnedRegion)}
          currentRegionId=""
          pinnedRegion={pinnedRegion}
          isPending={isPending}
          error={error}
          onSave={save}
          onClose={onClose}
        />
      );
    }
    if (account.isPending || account.isError || !account.data) {
      return (
        <>
          <Modal.Header>
            <Modal.Heading>{t('drivers.form.editTitle', { driver: '' })}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            {account.isPending ? (
              <p className="text-caption text-muted flex items-center gap-2">
                <Spinner size="sm" />
                {t('drivers.form.loading')}
              </p>
            ) : (
              <DialogError>
                {account.isError ? t(parseErrorKey(account.error, 'fetch')) : t('errors.managerNotFound')}
              </DialogError>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="ghost" size="sm" onPress={onClose}>
              {t('catalogue.confirm.close')}
            </Button>
          </Modal.Footer>
        </>
      );
    }
    const draft = draftFromAccount(account.data);
    return (
      <ManagerFormBody
        mode="edit"
        initial={pinnedRegion ? { ...draft, regionId: pinnedRegion } : draft}
        currentRegionId={account.data.regionId}
        pinnedRegion={pinnedRegion}
        isPending={isPending}
        error={error}
        onSave={save}
        onClose={onClose}
      />
    );
  })();

  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!isPending}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isPending) onClose();
      }}
    >
      <Modal.Container size="md">
        <Modal.Dialog>{body}</Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function ManagerFormBody({
  mode,
  initial,
  currentRegionId,
  pinnedRegion,
  isPending,
  error,
  onSave,
  onClose,
}: {
  mode: DriverFormMode;
  initial: DriverDraft;
  currentRegionId: string;
  pinnedRegion: string;
  isPending: boolean;
  error: string | null;
  onSave: (params: DriverParams) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const citiesQuery = useCities();
  const [draft, setDraft] = useState(initial);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const validation = validateDriverDraft(draft, mode);
  const errorFor = (field: DriverField) =>
    isSubmitted && !validation.ok && validation.field === field
      ? t(FIELD_ERROR_KEY[field], { count: MIN_PASSWORD_LENGTH })
      : null;

  const set = (key: keyof DriverDraft) => (value: string) => setDraft((current) => ({ ...current, [key]: value }));

  const cities = citiesQuery.data ?? [];
  const regionOptions: SelectOption[] = pinnedRegion
    ? [{ value: pinnedRegion, label: cities.find((city) => city.objectId === pinnedRegion)?.name ?? pinnedRegion }]
    : [
        { value: '', label: t('drivers.form.chooseRegion') },
        ...cities.map((city) => ({ value: city.objectId, label: city.name ?? city.objectId })),
      ];

  return (
    <form
      className="flex flex-col"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        setIsSubmitted(true);
        if (validation.ok && !isPending) onSave(validation.params);
      }}
    >
      <Modal.Header>
        <Modal.Heading>
          {mode === 'add' ? t('managers.form.addTitle') : t('drivers.form.editTitle', { driver: initial.fullname })}
        </Modal.Heading>
        <p className="text-caption text-muted">{mode === 'add' ? t('managers.form.addHint') : t('drivers.form.editHint')}</p>
      </Modal.Header>

      <Modal.Body className="flex flex-col gap-3">
        <TextField
          label={t('drivers.form.fullname')}
          value={draft.fullname}
          onChange={set('fullname')}
          error={errorFor('fullname')}
          isRequired
          autoComplete="off"
        />

        {mode === 'add' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField
              label={t('drivers.form.username')}
              value={draft.username}
              onChange={set('username')}
              error={errorFor('username')}
              isRequired
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <TextField
              label={t('drivers.form.password')}
              value={draft.password}
              onChange={set('password')}
              error={errorFor('password')}
              hint={t('drivers.form.passwordHint', { count: MIN_PASSWORD_LENGTH })}
              isRequired
              type="password"
              autoComplete="new-password"
            />
          </div>
        ) : (
          <TextField
            label={t('drivers.form.username')}
            value={draft.username}
            onChange={() => undefined}
            hint={t('drivers.form.usernameLocked')}
            readOnly
            className="opacity-70"
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={t('drivers.form.email')}
            value={draft.email}
            onChange={set('email')}
            error={errorFor('email')}
            isRequired
            type="email"
            autoComplete="off"
            spellCheck={false}
          />
          <TextField
            label={t('drivers.form.phone')}
            value={draft.phone}
            onChange={set('phone')}
            error={errorFor('phone')}
            hint={t('drivers.form.phoneHint')}
            isRequired
            type="tel"
            inputMode="tel"
            autoComplete="off"
            className="tabular"
          />
        </div>

        <div className="flex flex-col gap-1">
          <SelectField
            label={t('drivers.form.region')}
            value={draft.regionId}
            options={regionOptions}
            isDisabled={pinnedRegion.length > 0}
            onChange={set('regionId')}
          />
          {errorFor('region') ? (
            <p role="alert" className="text-micro text-danger">
              {errorFor('region')}
            </p>
          ) : pinnedRegion ? (
            <p className="text-micro text-faint">{t('managers.form.regionLocked')}</p>
          ) : mode === 'edit' && currentRegionId && draft.regionId && draft.regionId !== currentRegionId ? (
            <p className="text-micro text-warning-soft-foreground font-bold">{t('managers.form.regionChanged')}</p>
          ) : null}
        </div>

        {error && <DialogError>{error}</DialogError>}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="ghost" size="sm" isDisabled={isPending} onPress={onClose}>
          {t('catalogue.confirm.cancel')}
        </Button>
        <Button type="submit" variant="primary" size="sm" isPending={isPending}>
          {mode === 'add'
            ? t(isPending ? 'drivers.form.creating' : 'managers.list.add')
            : t(isPending ? 'drivers.form.saving' : 'drivers.form.save')}
        </Button>
      </Modal.Footer>
    </form>
  );
}
