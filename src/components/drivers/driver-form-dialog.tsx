'use client';

import { useState } from 'react';
import { Button, Modal, Spinner } from '@heroui/react';
import { useAccess } from '@/hooks/use-access';
import { useCities } from '@/hooks/use-cities';
import { useCreateDriver, useDriverAccount, useUpdateDriver } from '@/hooks/use-drivers';
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
import { DialogError } from './driver-bits';

const FIELD_ERROR_KEY: Record<DriverField, MessageKey> = {
  fullname: 'drivers.form.errors.fullname',
  username: 'drivers.form.errors.username',
  password: 'drivers.form.errors.password',
  email: 'drivers.form.errors.email',
  phone: 'drivers.form.errors.phone',
  region: 'drivers.form.errors.region',
};

/**
 * Adding a driver (no `driverId`) or editing one.
 *
 * Editing waits for the account to be read fresh through `getUsers` before it shows a
 * single field: the email lives only there, and a form opened on the list's copy of the row
 * would write back whatever it held when the list last refreshed. Mount it only while open,
 * so a draft never carries over to the next driver.
 */
export function DriverFormDialog({
  driverId,
  onClose,
  onDone,
}: {
  driverId?: string;
  onClose: () => void;
  /** A translated sentence saying what was saved. */
  onDone: (message: string) => void;
}) {
  const { t } = useI18n();
  const { region } = useAccess();
  const pinnedRegion = pinnedRegionId(region);
  const isEdit = !!driverId;

  const account = useDriverAccount(driverId ?? '', isEdit);
  const create = useCreateDriver();
  const update = useUpdateDriver();
  const isPending = create.isPending || update.isPending;
  const failure = create.error ?? update.error;

  const save = (params: DriverParams) => {
    if (!driverId) {
      create.mutate(params, { onSuccess: () => onDone(t('drivers.form.created', { driver: params.fullname })) });
      return;
    }
    update.mutate(
      { id: driverId, params, pinnedRegion },
      { onSuccess: () => onDone(t('drivers.form.saved', { driver: params.fullname })) },
    );
  };

  const body = (() => {
    if (!isEdit) {
      return (
        <DriverFormBody
          mode="add"
          initial={emptyDriverDraft(pinnedRegion)}
          currentRegionId=""
          pinnedRegion={pinnedRegion}
          isPending={isPending}
          error={failure ? t(parseErrorKey(failure, 'drivers')) : null}
          onSave={save}
          onClose={onClose}
        />
      );
    }
    if (account.isPending) {
      return <DialogStatus title={t('drivers.form.editTitle', { driver: '' })} onClose={onClose} isLoading />;
    }
    if (account.isError || !account.data) {
      return (
        <DialogStatus
          title={t('drivers.form.editTitle', { driver: '' })}
          message={account.isError ? t(parseErrorKey(account.error, 'fetch')) : t('errors.driverNotFound')}
          onClose={onClose}
        />
      );
    }
    const draft = draftFromAccount(account.data);
    return (
      <DriverFormBody
        mode="edit"
        // A staff account's region is its own, whatever the row says — the server would
        // take anything, so the form never offers anything else.
        initial={pinnedRegion ? { ...draft, regionId: pinnedRegion } : draft}
        currentRegionId={account.data.regionId}
        pinnedRegion={pinnedRegion}
        isPending={isPending}
        error={failure ? t(parseErrorKey(failure, 'drivers')) : null}
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

function DialogStatus({
  title,
  message,
  isLoading,
  onClose,
}: {
  title: string;
  message?: string;
  isLoading?: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <Modal.Header>
        <Modal.Heading>{title}</Modal.Heading>
      </Modal.Header>
      <Modal.Body>
        {isLoading ? (
          <p className="text-caption text-muted flex items-center gap-2">
            <Spinner size="sm" />
            {t('drivers.form.loading')}
          </p>
        ) : (
          <DialogError>{message}</DialogError>
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

/**
 * The form itself, mounted once its starting values are known — so the draft is plain
 * state initialised from them, not something an effect copies in (and copies over the
 * user's typing) when a background re-read lands.
 */
function DriverFormBody({
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
  /** The region on the row now, to say when saving would move the driver. */
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
  // Errors appear once Save has been pressed, then follow the draft as it is fixed.
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

  const name = initial.fullname;

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
          {mode === 'add' ? t('drivers.form.addTitle') : t('drivers.form.editTitle', { driver: name })}
        </Modal.Heading>
        <p className="text-caption text-muted">
          {mode === 'add' ? t('drivers.form.addHint') : t('drivers.form.editHint')}
        </p>
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
            <p className="text-micro text-faint">{t('drivers.form.regionLocked')}</p>
          ) : mode === 'edit' && currentRegionId && draft.regionId && draft.regionId !== currentRegionId ? (
            <p className="text-micro text-warning-soft-foreground font-bold">{t('drivers.form.regionChanged')}</p>
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
            ? t(isPending ? 'drivers.form.creating' : 'drivers.form.create')
            : t(isPending ? 'drivers.form.saving' : 'drivers.form.save')}
        </Button>
      </Modal.Footer>
    </form>
  );
}
