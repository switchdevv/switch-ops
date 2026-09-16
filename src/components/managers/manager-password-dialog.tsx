'use client';

import { useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { useAccess } from '@/hooks/use-access';
import { useResetManagerPassword } from '@/hooks/use-managers';
import { pinnedRegionId } from '@/lib/auth/access';
import { useI18n } from '@/lib/i18n/provider';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '@/lib/ops/driver-form';
import type { ManagerView } from '@/lib/ops/managers';
import { parseErrorKey } from '@/lib/parse/errors';
import { TextField } from '@/components/ui/form-controls';
import { DialogError, DialogWarning } from '@/components/drivers/driver-bits';

/** A new password for a manager — and the one way to sign them out. See `ResetPasswordDialog`. */
export function ManagerPasswordDialog({
  manager,
  onClose,
  onDone,
}: {
  manager: ManagerView;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useI18n();
  const { region } = useAccess();
  const reset = useResetManagerPassword();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const name = manager.row.fullname ?? manager.row.username ?? t('common.none');
  const validation = validateNewPassword(password, confirmation);
  const errorFor = (field: 'password' | 'confirmation') =>
    isSubmitted && !validation.ok && validation.field === field
      ? t(field === 'password' ? 'drivers.password.errors.password' : 'drivers.password.errors.confirmation', {
          count: MIN_PASSWORD_LENGTH,
        })
      : null;

  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!reset.isPending}
      onOpenChange={(isOpen) => {
        if (!isOpen && !reset.isPending) onClose();
      }}
    >
      <Modal.Container size="md">
        <Modal.Dialog>
          <form
            className="flex flex-col"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              setIsSubmitted(true);
              if (!validation.ok || reset.isPending) return;
              reset.mutate(
                { id: manager.id, password: validation.password, pinnedRegion: pinnedRegionId(region) },
                { onSuccess: () => onDone(t('drivers.password.done', { driver: name })) },
              );
            }}
          >
            <Modal.Header>
              <Modal.Heading>{t('drivers.password.title', { driver: name })}</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-3">
              <DialogWarning>{t('managers.password.signOutWarning')}</DialogWarning>

              <TextField
                label={t('drivers.password.new')}
                value={password}
                onChange={setPassword}
                error={errorFor('password')}
                hint={t('drivers.form.passwordHint', { count: MIN_PASSWORD_LENGTH })}
                isRequired
                type="password"
                autoComplete="new-password"
              />
              <TextField
                label={t('drivers.password.confirm')}
                value={confirmation}
                onChange={setConfirmation}
                error={errorFor('confirmation')}
                isRequired
                type="password"
                autoComplete="new-password"
              />

              {reset.isError && <DialogError>{t(parseErrorKey(reset.error, 'managers'))}</DialogError>}
            </Modal.Body>

            <Modal.Footer>
              <Button variant="ghost" size="sm" isDisabled={reset.isPending} onPress={onClose}>
                {t('catalogue.confirm.cancel')}
              </Button>
              <Button type="submit" variant="danger" size="sm" isPending={reset.isPending}>
                {t(reset.isPending ? 'drivers.password.saving' : 'drivers.password.submit')}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
