'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Popover, Skeleton, Switch } from '@heroui/react';
import { useAccess } from '@/hooks/use-access';
import { useSupportMessages, useSupportUnreadCount } from '@/hooks/use-support';
import { useAlertChannel } from '@/hooks/use-support-alert-prefs';
import { useReadMarks } from '@/hooks/use-support-read-marks';
import { useNow } from '@/hooks/use-now';
import { useI18n } from '@/lib/i18n/provider';
import {
  desktopNotificationPermission,
  requestDesktopNotifications,
  type NotificationPermissionState,
} from '@/lib/media/alerts';
import {
  isUnread,
  previewOf,
  senderApps,
  senderOf,
  BELL_LIST_SIZE,
  SENDER_APP_LABEL_KEY,
  SUPPORT_BELL_REFRESH_MS,
  type ReadMarks,
} from '@/lib/ops/support';
import {
  emptySupportFilters,
  supportMessageHref,
  supportUnreadHref,
} from '@/lib/url/support-filters';
import { BellIcon, CheckIcon } from '@/components/icons';
import type { SupportMessage } from '@/types/message';

/**
 * The support alerts, in the shell's header: how many messages this account hasn't opened,
 * and which.
 *
 * It is the unread inbox, not a log of notifications received. There is nowhere to keep
 * such a log that would be worth reading — the `Message` class has no "handled" column and
 * a Staff session can't add one (hooks/use-support-read-marks.ts) — and two lists that
 * disagree about what is outstanding would be worse than one. So opening a message from
 * anywhere empties it, and "Mark all as read" clears it, exactly as the inbox does.
 *
 * The count is the inbox's own query, asked with no filters at all — the inbox has no
 * region either (lib/services/support.ts) — so while /support is open the two share a
 * single request and can't disagree. The list is only asked for while the popover is open.
 *
 * It is also where this browser's alerts are turned down: the sound, and the operating
 * system's notifications (components/support-alerts.tsx raises both).
 */
export function SupportBell() {
  const { t, tCount, format } = useI18n();
  const { account } = useAccess();

  const accountId = account?.objectId ?? '';
  const { marks, markAllRead } = useReadMarks(accountId);

  const [isOpen, setIsOpen] = useState(false);
  const now = useNow(60_000);

  const filters = useMemo(() => emptySupportFilters(), []);

  // Slow on its own: arrivals reach this through the alert runner, which invalidates the
  // query the moment it sees one. The timer is only here to notice what happens elsewhere —
  // a message deleted, or read in another browser.
  const countQuery = useSupportUnreadCount(
    filters,
    marks,
    true,
    accountId.length > 0,
    SUPPORT_BELL_REFRESH_MS,
  );
  const count = countQuery.data ?? 0;

  // Asked with the marks as they were when the popover opened, so a message opened from
  // this list doesn't pull the rest out from under the cursor — the inbox's own bargain.
  const [snapshot, setSnapshot] = useState<ReadMarks | null>(null);
  const listQuery = useSupportMessages(
    { ...filters, unread: true },
    1,
    snapshot,
    false,
    isOpen && snapshot !== null,
  );

  const rows = (listQuery.data?.results ?? [])
    .filter((message) => isUnread(marks, message))
    .slice(0, BELL_LIST_SIZE);
  const rest = Math.max(0, count - rows.length);

  // Permission is the browser's, not ours, and it changes in browser UI we never see — so
  // it is read when the popover opens rather than remembered. Read here, in the event,
  // rather than in an effect: `Notification.permission` is not React state to sync with.
  const [permission, setPermission] = useState<NotificationPermissionState>('unsupported');

  const open = (next: boolean) => {
    setIsOpen(next);
    setSnapshot(next ? marks : null);
    if (next) setPermission(desktopNotificationPermission());
  };

  return (
    <Popover isOpen={isOpen} onOpenChange={open}>
      <Popover.Trigger
        tabIndex={0}
        aria-label={count > 0 ? tCount('support.alerts.openCount', count) : t('support.alerts.open')}
        className="text-muted hover:text-foreground focus-visible:ring-focus grid size-9 cursor-pointer place-items-center rounded-xl transition-colors outline-none focus-visible:ring-2"
      >
        <Badge.Anchor>
          <BellIcon className="size-[18px]" />
          {count > 0 && (
            <Badge color="danger" size="sm">
              {count > 99 ? '99+' : format.number(count)}
            </Badge>
          )}
        </Badge.Anchor>
      </Popover.Trigger>

      <Popover.Content placement="bottom end" className="w-[21rem] max-w-[calc(100vw-2rem)]">
        <Popover.Dialog aria-label={t('support.alerts.title')} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-h6 font-bold">{t('support.alerts.title')}</span>
            <Button variant="ghost" size="sm" isDisabled={count === 0} onPress={() => markAllRead()}>
              <CheckIcon aria-hidden className="size-4" />
              {t('support.alerts.markAllRead')}
            </Button>
          </div>

          {countQuery.isError || listQuery.isError ? (
            <p className="text-caption text-danger">{t('support.alerts.loadError')}</p>
          ) : listQuery.status === 'pending' ? (
            // Not the empty state: "You're all caught up" over a list still loading is a
            // lie, and the one the count next to it would immediately contradict.
            <div className="border-separator/70 flex flex-col gap-2 border-t pt-3">
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ) : rows.length === 0 ? (
            <div className="border-separator/70 flex flex-col gap-1 border-t py-4">
              <span className="text-body font-bold">{t('support.alerts.empty')}</span>
              <span className="text-caption text-muted">{t('support.alerts.emptyHint')}</span>
            </div>
          ) : (
            <ul className="border-separator/70 -mx-1 flex max-h-[19rem] flex-col overflow-y-auto border-t pt-1">
              {rows.map((message) => (
                <li key={message.objectId}>
                  <BellRow message={message} now={now} onOpen={() => open(false)} />
                </li>
              ))}
            </ul>
          )}

          <div className="border-separator/70 flex items-center justify-between gap-3 border-t pt-3">
            <Link
              href={supportUnreadHref()}
              onClick={() => open(false)}
              className="text-caption text-accent font-bold hover:underline"
            >
              {t('support.alerts.openInbox')}
            </Link>
            {rest > 0 && listQuery.status !== 'pending' && (
              <span className="text-caption text-muted">{tCount('support.alerts.more', rest)}</span>
            )}
          </div>

          <div className="border-separator/70 flex flex-col gap-2.5 border-t pt-3">
            <Preference label={t('support.alerts.sound')}>
              <ChannelSwitch channel="sound" label={t('support.alerts.sound')} />
            </Preference>

            {permission !== 'unsupported' && (
              <Preference label={t('support.alerts.desktop')}>
                {permission === 'granted' ? (
                  <ChannelSwitch channel="desktop" label={t('support.alerts.desktop')} />
                ) : permission === 'denied' ? (
                  <span className="text-caption text-muted max-w-[11rem] text-end">
                    {t('support.alerts.desktopBlocked')}
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    // The prompt is only allowed from a gesture, which is why this is a
                    // button and not something the runner asks for on its own.
                    onPress={() => void requestDesktopNotifications().then(setPermission)}
                  >
                    {t('support.alerts.desktopTurnOn')}
                  </Button>
                )}
              </Preference>
            )}

            <p className="text-caption text-faint">{t('support.alerts.hint')}</p>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}

/** One unread message: who wrote it, from which app, when, and the start of it. */
function BellRow({
  message,
  now,
  onOpen,
}: {
  message: SupportMessage;
  now: number;
  onOpen: () => void;
}) {
  const { t, format } = useI18n();
  const sender = senderOf(message);
  const name = (message.fullname ?? sender?.fullname ?? '').trim() || t('support.alerts.unknownSender');
  const [app] = senderApps(sender);
  const text = previewOf(message.message);

  return (
    <Link
      href={supportMessageHref(message.objectId)}
      onClick={onOpen}
      className="hover:bg-surface-secondary focus-visible:ring-focus flex flex-col gap-0.5 rounded-xl px-2 py-2 transition-colors outline-none focus-visible:ring-2"
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="text-body truncate font-bold">{name}</span>
        <span className="text-micro text-faint shrink-0">
          {format.relative(message.createdAt, now)}
        </span>
      </span>
      <span className="text-caption text-muted line-clamp-2">
        {text || t('support.list.noText')}
      </span>
      {app && (
        <span className="text-micro text-faint tracking-[0.1em] uppercase">
          {t(SENDER_APP_LABEL_KEY[app])}
        </span>
      )}
    </Link>
  );
}

function Preference({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-micro text-muted font-bold tracking-[0.1em] uppercase">{label}</span>
      {children}
    </div>
  );
}

/** One of this browser's alert channels, on or off. */
function ChannelSwitch({ channel, label }: { channel: 'sound' | 'desktop'; label: string }) {
  const { isEnabled, setEnabled } = useAlertChannel(channel);

  return (
    <Switch isSelected={isEnabled} onChange={setEnabled} aria-label={label}>
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  );
}
