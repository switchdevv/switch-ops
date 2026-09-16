'use client';

import { useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { useAccess } from '@/hooks/use-access';
import { useResetDriverPassword } from '@/hooks/use-drivers';
import { pinnedRegionId } from '@/lib/auth/access';
import { shortId } from '@/lib/format';
import { useI18n } from '@/lib/i18n/provider';
import { MIN_PASSWORD_LENGTH, validateNewPassword } from '@/lib/ops/driver-form';
import type { DriverView } from '@/lib/ops/drivers';
import { parseErrorKey } from '@/lib/parse/errors';
import { TextField } from '@/components/ui/form-controls';
import { DialogError, DialogWarning } from './driver-bits';

/**
 * A new password for a driver — and, on this backend, the one way to sign them out.
 *
 * Parse revokes every session of an account whose password changes, so the dialog says that
 * first, before the fields, and louder still when the driver is out on a delivery that the
 * sign-out would interrupt. Mount it only while open, so a typed password never lingers.
 */
export function ResetPasswordDialog({
  driver,
  onClose,
  onDone,
}: {
  driver: DriverView;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useI18n();
  const { region } = useAccess();
  const reset = useResetDriverPassword();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const name = driver.row.fullname ?? driver.row.username ?? t('common.none');
  const carrying = driver.orderIds[0];
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
                { id: driver.id, password: validation.password, pinnedRegion: pinnedRegionId(region) },
                { onSuccess: () => onDone(t('drivers.password.done', { driver: name })) },
              );
            }}
          >
            <Modal.Header>
              <Modal.Heading>{t('drivers.password.title', { driver: name })}</Modal.Heading>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-3">
              <DialogWarning>{t('drivers.password.signOutWarning')}</DialogWarning>
              {carrying && (
                <p className="text-caption bg-danger-soft text-danger-soft-foreground rounded-lg px-2.5 py-1.5 font-bold">
                  {t('drivers.password.deliveringWarning', { order: shortId(carrying) })}
                </p>
              )}

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

              {reset.isError && <DialogError>{t(parseErrorKey(reset.error, 'drivers'))}</DialogError>}
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
