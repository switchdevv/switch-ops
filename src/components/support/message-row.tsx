'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { isDeletionRequest, previewOf, senderApps, senderOf, SENDER_APP_LABEL_KEY } from '@/lib/ops/support';
import type { SupportMessage } from '@/types/message';
import { DriverAvatar, Tag } from '@/components/drivers/driver-bits';

/**
 * One message in the inbox: who, from which app, when, and the start of what they wrote.
 *
 * Unread rows carry the accent rail and a bold name, the way a mail client marks them —
 * the one thing an inbox has to show before a word is read. The open message is tinted.
 * The whole row is the link, so the target is as wide as the list.
 */
export function MessageRow({
  message,
  href,
  isSelected,
  isUnread,
  now,
}: {
  message: SupportMessage;
  href: string;
  isSelected: boolean;
  isUnread: boolean;
  now: number;
}) {
  const { t, format } = useI18n();
  const sender = senderOf(message);
  const name = message.fullname || sender?.fullname || t('common.none');
  const apps = senderApps(sender);
  const preview = previewOf(message.message);

  return (
    <li className="border-separator/70 border-b last:border-b-0">
      <Link
        href={href}
        replace
        scroll={false}
        aria-current={isSelected ? 'true' : undefined}
        data-message-id={message.objectId}
        className={
          'focus-visible:ring-focus relative flex gap-3 px-4 py-3 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset ' +
          (isSelected ? 'bg-accent-soft/60' : 'hover:bg-surface-secondary')
        }
      >
        <span
          aria-hidden
          className={'absolute inset-y-0 start-0 w-1 ' + (isUnread ? 'bg-accent' : 'bg-transparent')}
        />

        <DriverAvatar name={name} className="size-10" />

        {/* Text in the row is isolated with <bdi>, not `dir="auto"` on its block: that would
            also right-align an Arabic line under a left-aligned name and time. */}
        <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
          <div className="flex min-w-0 items-baseline gap-2">
            <span className={'text-body min-w-0 flex-1 truncate ' + (isUnread ? 'font-bold' : '')}>
              {isUnread && <span className="sr-only">{t('support.list.unread')} · </span>}
              <bdi>{name}</bdi>
            </span>
            <time
              dateTime={message.createdAt}
              title={format.dateTime(message.createdAt)}
              className={'text-caption tabular shrink-0 ' + (isUnread ? 'text-accent-soft-foreground font-bold' : 'text-faint')}
            >
              {format.relative(message.createdAt, now)}
            </time>
          </div>

          <p className={'text-caption line-clamp-2 ' + (isUnread ? 'text-foreground' : 'text-muted')}>
            {preview ? <bdi>{preview}</bdi> : <span className="text-faint italic">{t('support.list.noText')}</span>}
          </p>

          {/* Plain text, not chips: most senders hold several apps, so a chip per app on every
              row is colour that tells rows apart from nothing. The reader keeps the chips. A
              deletion request is the one thing here that needs to stand out. */}
          {(apps.length > 0 || isDeletionRequest(message.message)) && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              {isDeletionRequest(message.message) && <Tag tone="danger">{t('support.list.deletionRequest')}</Tag>}
              {apps.length > 0 && (
                <span className="text-micro text-faint truncate">
                  {apps.map((app) => t(SENDER_APP_LABEL_KEY[app])).join(' · ')}
                </span>
              )}
            </div>
          )}
        </div>
      </Link>
    </li>
  );
}
