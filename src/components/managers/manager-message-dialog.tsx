'use client';

import { useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { useMessageManager } from '@/hooks/use-managers';
import { useI18n } from '@/lib/i18n/provider';
import { MESSAGE_BODY_MAX, MESSAGE_TITLE_MAX, validateMessage } from '@/lib/ops/driver-form';
import type { ManagerView } from '@/lib/ops/managers';
import { parseErrorKey } from '@/lib/parse/errors';
import { TextAreaField, TextField } from '@/components/ui/form-controls';
import { DialogError, DialogWarning } from '@/components/drivers/driver-bits';

/** A push to the manager app, shown there as a popup — see `messageManager`. */
export function ManagerMessageDialog({
  manager,
  onClose,
  onDone,
}: {
  manager: ManagerView;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useI18n();
  const send = useMessageManager();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const name = manager.row.fullname ?? manager.row.username ?? t('common.none');
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
                { id: manager.id, title: validation.title, body: validation.body },
                { onSuccess: () => onDone(t('drivers.message.sent', { driver: name })) },
              );
            }}
          >
            <Modal.Header>
              <Modal.Heading>{t('drivers.message.title', { driver: name })}</Modal.Heading>
              <p className="text-caption text-muted">{t('managers.message.hint')}</p>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-3">
              {manager.status === 'deactivated' && <DialogWarning>{t('managers.message.deactivatedNote')}</DialogWarning>}

              <TextField
                label={t('drivers.message.messageTitle')}
                value={title}
                onChange={setTitle}
                error={errorFor('title')}
                placeholder={t('managers.message.titlePlaceholder')}
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

              {send.isError && <DialogError>{t(parseErrorKey(send.error, 'managers'))}</DialogError>}
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
