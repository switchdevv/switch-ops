'use client';

import { useState } from 'react';
import { Button, Modal } from '@heroui/react';
import { useReplyToMessage } from '@/hooks/use-support';
import { useI18n } from '@/lib/i18n/provider';
import {
  REPLY_BODY_MAX,
  REPLY_TITLE_MAX,
  SENDER_APP_LABEL_KEY,
  validateReply,
  type SenderApp,
} from '@/lib/ops/support';
import { parseErrorKey } from '@/lib/parse/errors';
import { TextAreaField, TextField } from '@/components/ui/form-controls';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { DialogError } from '@/components/drivers/driver-bits';

/**
 * A reply to a support message, as a push to the sender's phone (see `replyToMessage`).
 *
 * A message doesn't say which app it came from, so when the account has more than one the
 * dialog asks — the push goes to one app's token, and the wrong one may be an app they
 * haven't opened in months.
 */
export function ReplyDialog({
  messageId,
  name,
  apps,
  pinnedRegion,
  onClose,
  onDone,
}: {
  messageId: string;
  name: string;
  /** At least one. */
  apps: SenderApp[];
  pinnedRegion: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { t } = useI18n();
  const send = useReplyToMessage();
  const [app, setApp] = useState<SenderApp>(apps[0]);
  const [title, setTitle] = useState(() => t('support.reply.defaultTitle'));
  const [body, setBody] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  const validation = validateReply(title, body);
  const errorFor = (field: 'title' | 'body') =>
    isSubmitted && !validation.ok && validation.field === field
      ? t(field === 'title' ? 'support.reply.errors.title' : 'support.reply.errors.body')
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
                { id: messageId, app, title: validation.title, body: validation.body, pinnedRegion },
                { onSuccess: () => onDone(t('support.reply.sent', { name })) },
              );
            }}
          >
            <Modal.Header>
              <Modal.Heading>
                <span dir="auto">{t('support.reply.title', { name })}</span>
              </Modal.Heading>
              <p className="text-caption text-muted">{t('support.reply.hint')}</p>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-3">
              {apps.length > 1 && (
                <div className="flex flex-col gap-1">
                  <span className="text-micro text-muted font-bold tracking-[0.1em] uppercase">
                    {t('support.reply.app')}
                  </span>
                  <SegmentedControl
                    label={t('support.reply.app')}
                    options={apps.map((key) => ({ key, label: t(SENDER_APP_LABEL_KEY[key]) }))}
                    value={app}
                    onChange={setApp}
                    isDisabled={send.isPending}
                  />
                  <p className="text-micro text-faint">{t('support.reply.appHint')}</p>
                </div>
              )}

              <TextField
                label={t('support.reply.messageTitle')}
                value={title}
                onChange={setTitle}
                error={errorFor('title')}
                maxLength={REPLY_TITLE_MAX}
                isRequired
                autoComplete="off"
              />
              <TextAreaField
                label={t('support.reply.body')}
                value={body}
                onChange={setBody}
                error={errorFor('body')}
                hint={`${body.length} / ${REPLY_BODY_MAX}`}
                rows={5}
                maxLength={REPLY_BODY_MAX}
              />

              {send.isError && <DialogError>{t(parseErrorKey(send.error, 'support'))}</DialogError>}
            </Modal.Body>

            <Modal.Footer>
              <Button variant="ghost" size="sm" isDisabled={send.isPending} onPress={onClose}>
                {t('catalogue.confirm.cancel')}
              </Button>
              <Button type="submit" variant="primary" size="sm" isPending={send.isPending}>
                {t(send.isPending ? 'support.reply.sending' : 'support.reply.send')}
              </Button>
            </Modal.Footer>
          </form>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
