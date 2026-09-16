'use client';

import { useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { useCustomerAccount, useResetCustomerPassword } from '@/hooks/use-customers';
import { useI18n } from '@/lib/i18n/provider';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '@/lib/ops/driver-form';
import { parseErrorKey } from '@/lib/parse/errors';
import { TextField } from '@/components/ui/form-controls';
import { AlertIcon } from '@/components/icons';

/**
 * A new password, typed twice. Changing it signs the customer out everywhere — Parse revokes
 * every session on a password change — which is also the only way to sign someone out, so
 * the dialog says so before, not after.
 */
export function ResetPasswordDialog({
  customerId,
  name,
  onClose,
  onDone,
}: {
  customerId: string;
  name: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const account = useCustomerAccount(customerId);
  const reset = useResetCustomerPassword();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [invalid, setInvalid] = useState<'password' | 'confirmation' | null>(null);
  const providers = account.data?.signInProviders ?? [];

  const submit = () => {
    const result = validateNewPassword(password, confirmation);
    if (!result.ok) {
      setInvalid(result.field);
      return;
    }
    reset.mutate({ id: customerId, password: result.password }, { onSuccess: onDone });
  };

  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!reset.isPending}
      onOpenChange={(isOpen) => {
        if (!isOpen && !reset.isPending) onClose();
      }}
    >
      <Modal.Container size="sm">
        <Modal.Dialog>
          <form
            className="flex flex-col"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              if (!reset.isPending) submit();
            }}
          >
            <Modal.Header>
              <Modal.Heading>{t('customers.password.title', { customer: name })}</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-3">
              <p className="text-caption bg-warning-soft text-warning-soft-foreground rounded-lg px-2.5 py-1.5">
                {t('customers.password.signOutWarning')}
              </p>
              {providers.length > 0 && (
                <p className="text-caption text-muted">
                  {t('customers.password.providers', { providers: providers.join(', ') })}
                </p>
              )}

              <TextField
                label={t('customers.password.new')}
                value={password}
                onChange={(value) => {
                  setPassword(value);
                  setInvalid(null);
                }}
                error={invalid === 'password' ? t('customers.password.errors.password', { count: MIN_PASSWORD_LENGTH }) : null}
                hint={t('customers.form.passwordHint', { count: MIN_PASSWORD_LENGTH })}
                type="password"
                autoComplete="new-password"
                autoFocus
              />
              <TextField
                label={t('customers.password.confirm')}
                value={confirmation}
                onChange={(value) => {
                  setConfirmation(value);
                  setInvalid(null);
                }}
                error={invalid === 'confirmation' ? t('customers.password.errors.confirmation') : null}
                type="password"
                autoComplete="new-password"
              />

              {reset.isError && (
                <div role="alert" className="bg-danger-soft text-danger-soft-foreground flex items-start gap-2 rounded-xl p-2.5">
                  <AlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                  <p className="text-caption">{t(parseErrorKey(reset.error, 'customers'))}</p>
                </div>
              )}
            </Modal.Body>

            <Modal.Footer>
              <Button variant="ghost" size="sm" isDisabled={reset.isPending} onPress={onClose}>
                {t('customers.form.cancel')}
              </Button>
              <Button type="submit" variant="danger" size="sm" isPending={reset.isPending}>
                {t(reset.isPending ? 'customers.password.saving' : 'customers.password.submit')}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
