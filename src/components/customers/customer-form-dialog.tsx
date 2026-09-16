'use client';

import { useState } from 'react';
import { Button, Modal, Spinner } from '@heroui/react';
import { useActor, useCreateCustomer, useCustomerAccount, useUpdateCustomer } from '@/hooks/use-customers';
import { useCities } from '@/hooks/use-cities';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { useI18n } from '@/lib/i18n/provider';
import {
  draftFromCustomer,
  emptyCustomerDraft,
  validateCustomerDraft,
  type CustomerDraft,
  type CustomerField,
  type CustomerFormMode,
} from '@/lib/ops/customer-form';
import { MIN_PASSWORD_LENGTH } from '@/lib/ops/driver-form';
import { parseErrorKey } from '@/lib/parse/errors';
import type { CustomerAccount } from '@/types/customer';
import { Field, TextField } from '@/components/ui/form-controls';
import { SelectField } from '@/components/ui/select-field';
import { AlertIcon } from '@/components/icons';

const FIELD_ERROR: Record<CustomerField, MessageKey> = {
  fullname: 'customers.form.errors.fullname',
  username: 'customers.form.errors.username',
  password: 'customers.form.errors.password',
  email: 'customers.form.errors.email',
  phone: 'customers.form.errors.phone',
  region: 'customers.form.errors.region',
};

/**
 * Add a customer, or edit one. An edit loads the account through `getUsers` first — the only
 * read that has their email — and only renders the form once it has it, so a half-loaded
 * draft can never be saved over the real one.
 */
export function CustomerFormDialog({
  mode,
  customerId,
  onClose,
  onDone,
}: {
  mode: CustomerFormMode;
  customerId?: string;
  onClose: () => void;
  /** Called with the saved name. */
  onDone: (name: string) => void;
}) {
  const { t } = useI18n();
  const account = useCustomerAccount(mode === 'edit' ? (customerId ?? '') : '');
  const create = useCreateCustomer();
  const update = useUpdateCustomer();
  const isPending = create.isPending || update.isPending;

  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!isPending}
      onOpenChange={(isOpen) => {
        if (!isOpen && !isPending) onClose();
      }}
    >
      <Modal.Container size="md">
        <Modal.Dialog>
          {mode === 'edit' && account.isPending ? (
            <Modal.Body className="text-caption text-muted flex flex-row items-center gap-2 py-10">
              <Spinner size="sm" />
              {t('customers.form.loading')}
            </Modal.Body>
          ) : mode === 'edit' && !account.data ? (
            <>
              <Modal.Header>
                <Modal.Heading>{t('customers.form.loadFailed')}</Modal.Heading>
              </Modal.Header>
              <Modal.Body>
                <p className="text-body text-muted">
                  {account.isError ? t(parseErrorKey(account.error, 'fetch')) : t('errors.customerNotFound')}
                </p>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="ghost" size="sm" onPress={onClose}>
                  {t('customers.form.cancel')}
                </Button>
              </Modal.Footer>
            </>
          ) : (
            <CustomerForm mode={mode} account={account.data ?? null} create={create} update={update} onClose={onClose} onDone={onDone} />
          )}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function CustomerForm({
  mode,
  account,
  create,
  update,
  onClose,
  onDone,
}: {
  mode: CustomerFormMode;
  account: CustomerAccount | null;
  /** Owned by the dialog, so it can refuse to close while one is in flight. */
  create: ReturnType<typeof useCreateCustomer>;
  update: ReturnType<typeof useUpdateCustomer>;
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const { t } = useI18n();
  const { pinnedRegion } = useActor();
  const cities = useCities();
  const mutation = mode === 'add' ? create : update;

  const [draft, setDraft] = useState<CustomerDraft>(() =>
    account ? draftFromCustomer(account) : emptyCustomerDraft(pinnedRegion),
  );
  const [invalid, setInvalid] = useState<CustomerField | null>(null);

  const set = (patch: Partial<CustomerDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setInvalid(null);
  };
  const errorFor = (field: CustomerField) =>
    invalid === field ? t(FIELD_ERROR[field], { count: MIN_PASSWORD_LENGTH }) : null;

  const regionOptions = pinnedRegion
    ? [{ value: pinnedRegion, label: cities.data?.find((city) => city.objectId === pinnedRegion)?.name ?? pinnedRegion }]
    : [
        { value: '', label: t('customers.form.chooseRegion') },
        ...(cities.data ?? []).map((city) => ({ value: city.objectId, label: city.name ?? city.objectId })),
      ];
  const movesRegion = mode === 'edit' && !!account?.regionId && draft.regionId !== account.regionId;

  const submit = () => {
    const result = validateCustomerDraft(draft, mode);
    if (!result.ok) {
      setInvalid(result.field);
      return;
    }
    const name = result.params.fullname;
    if (mode === 'add') create.mutate(result.params, { onSuccess: () => onDone(name) });
    else if (account) update.mutate({ id: account.objectId, params: result.params }, { onSuccess: () => onDone(name) });
  };

  return (
    <form
      className="flex flex-col"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!mutation.isPending) submit();
      }}
    >
      <Modal.Header>
        <Modal.Heading>
          {mode === 'add'
            ? t('customers.form.addTitle')
            : t('customers.form.editTitle', { customer: account?.fullname || account?.username || '' })}
        </Modal.Heading>
        <p className="text-caption text-muted">{t(mode === 'add' ? 'customers.form.addHint' : 'customers.form.editHint')}</p>
      </Modal.Header>

      <Modal.Body className="flex flex-col gap-3">
        <TextField
          label={t('customers.form.fullname')}
          value={draft.fullname}
          onChange={(fullname) => set({ fullname })}
          error={errorFor('fullname')}
          isRequired
          autoComplete="off"
          autoFocus
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={t('customers.form.username')}
            value={draft.username}
            onChange={(username) => set({ username })}
            error={errorFor('username')}
            hint={mode === 'edit' ? t('customers.form.usernameLocked') : undefined}
            isRequired={mode === 'add'}
            disabled={mode === 'edit'}
            autoComplete="off"
            spellCheck={false}
          />
          {mode === 'add' && (
            <TextField
              label={t('customers.form.password')}
              value={draft.password}
              onChange={(password) => set({ password })}
              error={errorFor('password')}
              hint={t('customers.form.passwordHint', { count: MIN_PASSWORD_LENGTH })}
              isRequired
              type="password"
              autoComplete="new-password"
            />
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <TextField
            label={t('customers.form.email')}
            value={draft.email}
            onChange={(email) => set({ email })}
            error={errorFor('email')}
            isRequired
            type="email"
            autoComplete="off"
            spellCheck={false}
          />
          <TextField
            label={t('customers.form.phone')}
            value={draft.phone}
            onChange={(phone) => set({ phone })}
            error={errorFor('phone')}
            hint={t('customers.form.phoneHint')}
            isRequired
            type="tel"
            inputMode="tel"
            autoComplete="off"
            className="tabular"
          />
        </div>

        <Field
          label={t('customers.form.region')}
          error={errorFor('region')}
          hint={pinnedRegion ? t('customers.form.regionLocked') : undefined}
          isRequired
        >
          <SelectField
            label=""
            value={draft.regionId}
            options={regionOptions}
            isDisabled={!!pinnedRegion}
            onChange={(regionId) => set({ regionId })}
            className={`[&>label]:hidden ${invalid === 'region' ? '[&_select]:border-danger' : ''}`}
          />
        </Field>
        {movesRegion && (
          <p className="text-caption bg-warning-soft text-warning-soft-foreground rounded-lg px-2.5 py-1.5">
            {t('customers.form.regionChanged')}
          </p>
        )}

        {mutation.isError && (
          <div role="alert" className="bg-danger-soft text-danger-soft-foreground flex items-start gap-2 rounded-xl p-2.5">
            <AlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p className="text-caption">{t(parseErrorKey(mutation.error, 'customers'))}</p>
          </div>
        )}
      </Modal.Body>

      <Modal.Footer>
        <Button variant="ghost" size="sm" isDisabled={mutation.isPending} onPress={onClose}>
          {t('customers.form.cancel')}
        </Button>
        <Button type="submit" variant="primary" size="sm" isPending={mutation.isPending}>
          {mode === 'add'
            ? t(mutation.isPending ? 'customers.form.creating' : 'customers.form.create')
            : t(mutation.isPending ? 'customers.form.saving' : 'customers.form.save')}
        </Button>
      </Modal.Footer>
    </form>
  );
}
