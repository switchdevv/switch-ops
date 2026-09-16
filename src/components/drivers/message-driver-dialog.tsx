'use client';

import { useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { useMessageDriver } from '@/hooks/use-drivers';
import { useI18n } from '@/lib/i18n/provider';
import { MESSAGE_BODY_MAX, MESSAGE_TITLE_MAX, validateMessage } from '@/lib/ops/driver-form';
import type { DriverView } from '@/lib/ops/drivers';
import { parseErrorKey } from '@/lib/parse/errors';
import { TextAreaField, TextField } from '@/components/ui/form-controls';
import { DialogError, DialogWarning } from './driver-bits';

/**
 * A push to one driver, in ops' own words. It lands in the driver app as a card with the
 * title and the text, and nothing else happens (see `messageDriver`) — so the dialog says
 * that it can't be replied to, which is the first thing anyone assumes about a message.
 */
export function MessageDriverDialog({
  driver,
  onClose,
  onDone,
}: {
  driver: DriverView;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useI18n();
  const send = useMessageDriver();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const name = driver.row.fullname ?? driver.row.username ?? t('common.none');
  const validation = validateMessage(title, body);
  const errorFor = (field: 'title' | 'body') =>
    isSubmitted && !validation.ok && validation.field === field
      ? t(field === 'title' ? 'drivers.message.errors.title' : 'drivers.message.errors.body')
      : null;

  return (
    <Modal.Backdrop
      isOpen
      isDismissable={!send.isPending}
      onOpenChange={(isOpen) => {
        if (!isOpen && !send.isPending) onClose();
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
              if (!validation.ok || send.isPending) return;
              send.mutate(
                { id: driver.id, title: validation.title, body: validation.body },
                { onSuccess: () => onDone(t('drivers.message.sent', { driver: name })) },
              );
            }}
          >
            <Modal.Header>
              <Modal.Heading>{t('drivers.message.title', { driver: name })}</Modal.Heading>
              <p className="text-caption text-muted">{t('drivers.message.hint')}</p>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-3">
              {driver.status === 'deactivated' && <DialogWarning>{t('drivers.message.deactivatedNote')}</DialogWarning>}

              <TextField
                label={t('drivers.message.messageTitle')}
                value={title}
                onChange={setTitle}
                error={errorFor('title')}
                placeholder={t('drivers.message.titlePlaceholder')}
                maxLength={MESSAGE_TITLE_MAX}
                isRequired
                autoComplete="off"
              />
              <TextAreaField
                label={t('drivers.message.body')}
                value={body}
                onChange={setBody}
                error={errorFor('body')}
                hint={`${body.length} / ${MESSAGE_BODY_MAX}`}
                rows={4}
                maxLength={MESSAGE_BODY_MAX}
              />

              {send.isError && <DialogError>{t(parseErrorKey(send.error, 'drivers'))}</DialogError>}
            </Modal.Body>

            <Modal.Footer>
              <Button variant="ghost" size="sm" isDisabled={send.isPending} onPress={onClose}>
                {t('catalogue.confirm.cancel')}
              </Button>
              <Button type="submit" variant="primary" size="sm" isPending={send.isPending}>
                {t(send.isPending ? 'drivers.message.sending' : 'drivers.message.send')}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
