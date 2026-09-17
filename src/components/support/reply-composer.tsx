'use client';

import { useRef, useState } from 'react';
import { Button } from '@heroui/react';
import { useReplyToMessage } from '@/hooks/use-support';
import { useI18n } from '@/lib/i18n/provider';
import {
  quickRepliesFor,
  REPLY_BODY_MAX,
  SENDER_APP_LABEL_KEY,
  validateReply,
  type SenderApp,
} from '@/lib/ops/support';
import { parseErrorKey } from '@/lib/parse/errors';
import { SendIcon } from '@/components/icons';

/**
 * The answer to a message, written where the message is read.
 *
 * This inbox is not a ticket queue: ops and drivers use it to talk while a delivery is
 * running — a driver writes what the order really came to, ops correct it and say so. So
 * replying is a box under the message with Enter to send, not a dialog to open, fill and
 * dismiss; the three answers that get sent all evening are one press away; and the reply
 * lands in the sender's app as a card with a Reply button that opens their own Support
 * screen (see `replyToMessage`), which is what brings their next line back here.
 *
 * What ops don't write — the card's title, that button's word — is in the language of the
 * app it lands in, from `replyCopyFor`; the quick answers follow the app picked, from
 * `quickRepliesFor`. A quick answer *fills the box*
 * rather than sending: what goes out is always what was on screen, and a push can't be
 * taken back.
 */

/** The reply box the inbox's R shortcut focuses. One message is open at a time, so one
 * composer is on screen at a time. */
export const REPLY_BOX_ID = 'support-reply-box';

export function ReplyComposer({
  messageId,
  name,
  apps,
  language,
  pinnedRegion,
}: {
  messageId: string;
  name: string;
  /** The sender's apps, likeliest first — at least one. */
  apps: SenderApp[];
  /** The sender's `_User.language`, which picks the copy around the reply. */
  language: string | undefined;
  pinnedRegion: string;
}) {
  const { t, format } = useI18n();
  const send = useReplyToMessage();
  const [app, setApp] = useState<SenderApp>(apps[0]);
  const [body, setBody] = useState('');
  const [isEmpty, setIsEmpty] = useState(false);
  /** The last reply that went out from this screen. A push leaves no trace anywhere else —
   * nothing on the message, nothing another console could read — so this is here to answer
   * "did I already tell them?" while the message is still open. */
  const [sent, setSent] = useState<{ at: string; text: string } | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const quickReplies = quickRepliesFor(app, language);

  const fill = (text: string) => {
    setIsEmpty(false);
    setBody((current) => (current.trim() ? `${current.trim()} ${text}` : text));
    boxRef.current?.focus();
  };

  const submit = () => {
    if (send.isPending) return;
    const validation = validateReply(body);
    if (!validation.ok) {
      setIsEmpty(true);
      boxRef.current?.focus();
      return;
    }
    send.mutate(
      { id: messageId, app, body: validation.body, pinnedRegion },
      {
        onSuccess: () => {
          setSent({ at: new Date().toISOString(), text: validation.body });
          setBody('');
          boxRef.current?.focus();
        },
      },
    );
  };

  return (
    <section
      aria-label={t('support.reply.label', { name })}
      className="border-border/70 bg-surface-secondary/40 flex flex-col gap-2 rounded-2xl border p-3"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {quickReplies.map((text) => (
          <button
            key={text}
            type="button"
            dir="auto"
            onClick={() => fill(text)}
            className="text-caption border-border/70 bg-surface hover:bg-surface-tertiary focus-visible:ring-focus rounded-pill border px-2.5 py-1 font-bold transition-colors outline-none focus-visible:ring-2"
          >
            {text}
          </button>
        ))}
      </div>

      {/* `dir="auto"` so a reply typed in Arabic lays itself out — most of them are. */}
      <textarea
        id={REPLY_BOX_ID}
        ref={boxRef}
        dir="auto"
        rows={2}
        value={body}
        maxLength={REPLY_BODY_MAX}
        placeholder={t('support.reply.placeholder', { name })}
        aria-label={t('support.reply.label', { name })}
        aria-invalid={isEmpty || undefined}
        onChange={(event) => {
          setBody(event.target.value);
          setIsEmpty(false);
        }}
        onKeyDown={(event) => {
          // Enter sends, as in every chat these replies compete with. `isComposing` is
          // what keeps an Arabic or predictive-keyboard composition from being sent by the
          // Enter that only meant to accept a word.
          if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          submit();
        }}
        className={
          'text-body bg-field-background text-field-foreground placeholder:text-field-placeholder focus-visible:ring-focus w-full resize-y rounded-xl border px-3 py-2 outline-none focus-visible:ring-2 ' +
          (isEmpty ? 'border-danger' : 'border-field-border')
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-micro text-faint min-w-0 flex-1">
          {t('support.reply.lands', { app: t(SENDER_APP_LABEL_KEY[app]) })}{' '}
          {t('support.reply.keyHint')}
        </p>

        <div className="flex shrink-0 items-center gap-2">
          {/* Only when the account holds more than one app: the reply goes to one app's
              push token, and the others may be apps they haven't opened in months. */}
          {apps.length > 1 && (
            <select
              aria-label={t('support.reply.app')}
              value={app}
              disabled={send.isPending}
              onChange={(event) => setApp(event.target.value as SenderApp)}
              className="text-caption border-field-border bg-field-background text-field-foreground focus-visible:ring-focus h-8 rounded-xl border px-2 outline-none focus-visible:ring-2 disabled:opacity-50"
            >
              {apps.map((key) => (
                <option key={key} value={key}>
                  {t(SENDER_APP_LABEL_KEY[key])}
                </option>
              ))}
            </select>
          )}
          <Button type="button" variant="primary" size="sm" isPending={send.isPending} onPress={submit}>
            <SendIcon aria-hidden className="size-4" />
            {t(send.isPending ? 'support.reply.sending' : 'support.reply.send')}
          </Button>
        </div>
      </div>

      {isEmpty && (
        <p role="alert" className="text-micro text-danger">
          {t('support.reply.errors.body')}
        </p>
      )}

      {send.isError && (
        <p role="alert" className="text-caption text-danger-soft-foreground bg-danger-soft rounded-xl px-2.5 py-2">
          {t(parseErrorKey(send.error, 'support'))}
        </p>
      )}

      {sent && !send.isError && (
        <p className="text-caption text-success-soft-foreground bg-success-soft rounded-xl px-2.5 py-2">
          <span className="font-bold">{t('support.reply.sent', { time: format.time(sent.at) })}</span>{' '}
          <bdi>{sent.text}</bdi>
        </p>
      )}
    </section>
  );
}
