'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '@/hooks/use-access';
import { isAlertChannelEnabled } from '@/hooks/use-support-alert-prefs';
import { useReadMarks } from '@/hooks/use-support-read-marks';
import { pinnedRegionId } from '@/lib/auth/access';
import { useI18n } from '@/lib/i18n/provider';
import { playAlertSound, primeAlertSound, showDesktopNotification } from '@/lib/media/alerts';
import {
  advanceCursor,
  isInScope,
  isUnread,
  previewOf,
  senderOf,
  ALERT_CURSOR_MAX_AGE_MS,
  ALERT_PREVIEW_CHARS,
  SUPPORT_ALERT_TICK_MS,
  SUPPORT_ALERT_TIMEOUT_MS,
  type AlertCursor,
} from '@/lib/ops/support';
import { queryKeys } from '@/lib/query/keys';
import { listMessagesSince, newestMessageCursor } from '@/lib/services/support';
import { supportMessageHref, supportUnreadHref } from '@/lib/url/support-filters';
import { startTicker } from '@/lib/worker-ticker';
import { ChatIcon } from '@/components/icons';
import type { SupportMessage } from '@/types/message';

/**
 * Notices a support message arriving and says so. Renders nothing.
 *
 * Mounted once, in the dashboard layout, so it watches from whichever page of the console
 * is open — the same bargain as the driver queue next to it: with no console open,
 * nothing is noticed. That is the trade the team chose over web push, which can't be
 * copied from switch-dashboard as it stands (docs/support-push-notifications.md explains
 * why, and what a later move to it needs).
 *
 * Three things it borrows from components/queue-runner.tsx, for the same reasons:
 *
 * - **One tab per browser looks.** Every tab mounts this, only the one holding a Web Lock
 *   polls — otherwise three open tabs would ring three times. With no Web Locks, each tab
 *   looks for itself; a repeat notification is replaced by its tag rather than stacking.
 * - **The beat comes from a worker** (lib/worker-ticker.ts), because a background tab is
 *   exactly where this has to keep working, and that is where Chrome throttles timers.
 * - **A look that hangs is abandoned.** Parse 8 fetches have no timeout, and a look stuck
 *   on one would be the last look this browser ever took.
 *
 * What it adds is **leadership follows the person**: a tab takes the lock when it is
 * focused. The toast then appears where someone is looking, and the sound plays from a tab
 * that has been clicked in — browsers refuse to play audio in one that hasn't.
 */

const LOCK_NAME = 'switch-ops:support-alerts';
const CHANNEL_NAME = 'switch-ops:support-alerts';
const CURSOR_PREFIX = 'switch-ops.support.alerts.';

/** Announced by the tab that looked, so the others' bells catch up without looking too. */
type AlertMessage = { type: 'arrived' };

/* ---- where this browser has read up to -------------------------------------------- */

type StoredCursor = AlertCursor & { checkedAt: number };

function cursorKey(accountId: string) {
  return `${CURSOR_PREFIX}${accountId}`;
}

/**
 * The cursor this browser last saved, or null to start again from the inbox as it stands.
 *
 * Shared by every tab through localStorage rather than held in the leading tab: leadership
 * moves whenever someone clicks another tab, and a cursor that moved with it would either
 * re-announce what the last leader already did or skip what it hadn't reached yet. A
 * reload passes through here too, which is why the console doesn't go quiet for the
 * seconds it takes to come back.
 */
function readCursor(accountId: string): AlertCursor | null {
  try {
    const raw = window.localStorage.getItem(cursorKey(accountId));
    const parsed = raw ? (JSON.parse(raw) as Partial<StoredCursor>) : null;
    if (!parsed || typeof parsed.at !== 'number' || !Array.isArray(parsed.ids)) return null;
    if (typeof parsed.checkedAt !== 'number') return null;
    // Older than this and the console was closed rather than reloading, so what was
    // missed is backlog: it belongs in the bell's count, not in a burst of notifications.
    if (Date.now() - parsed.checkedAt > ALERT_CURSOR_MAX_AGE_MS) return null;
    return { at: parsed.at, ids: parsed.ids.filter((id): id is string => typeof id === 'string') };
  } catch {
    return null;
  }
}

function saveCursor(accountId: string, cursor: AlertCursor): void {
  try {
    const stored: StoredCursor = { ...cursor, checkedAt: Date.now() };
    window.localStorage.setItem(cursorKey(accountId), JSON.stringify(stored));
  } catch {
    // Refused storage: this tab keeps its own cursor in memory for as long as it leads,
    // and a new leader starts from the inbox as it stands.
  }
}

/* ---- the runner -------------------------------------------------------------------- */

export function SupportAlerts() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t, tCount } = useI18n();
  const { region: scope, role, account } = useAccess();

  const accountId = account?.objectId ?? '';
  const isEnabled = role !== null && scope.kind !== 'unassigned' && accountId.length > 0;
  const pinnedRegion = pinnedRegionId(scope);

  const { marks } = useReadMarks(accountId);

  // The runner outlives any one render: it is started by an effect and then ticks for
  // hours. Everything it needs to *read* at that point goes through a ref, so a language
  // switch or a message being opened doesn't tear the lock down and rebuild it.
  const latest = useRef({ t, tCount, router, marks });
  useEffect(() => {
    latest.current = { t, tCount, router, marks };
  });

  useEffect(() => {
    if (!isEnabled) return;

    // Whichever tab ends up leading has to be allowed to make a sound, and that is decided
    // per document, by whether anyone has clicked in it.
    primeAlertSound();

    const unmount = new AbortController();
    const hasLocks = typeof navigator !== 'undefined' && 'locks' in navigator;
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);
    /** Set while this tab leads: what the worker's beat does. */
    let onBeat: (() => void) | null = null;
    /** A steal asked for and not yet granted — without this, the focus and visibility
     * events that arrive together would each ask for one. */
    let isStealing = false;

    // Joined, not restarted, when a read is already under way — see
    // `invalidateQueueFromRunner` in hooks/use-queue.ts for why restarting only doubles it.
    const refreshBell = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.support.all }, { cancelRefetch: false });
    };

    if (channel) {
      // A BroadcastChannel doesn't hear itself, which is what makes this safe: the tab that
      // announced has already refreshed, and only the others act on this.
      channel.onmessage = (event: MessageEvent<AlertMessage>) => {
        if (event.data?.type === 'arrived') refreshBell();
      };
    }

    /**
     * Toast, sound, desktop notification — in the tab that found them.
     *
     * One alert for the look, however many messages it turned up: three arriving together
     * is one interruption, not three, and three toasts would push each other off the
     * screen. It speaks for the **newest** of them, because that is the one whose text
     * someone is about to read, and offers the rest as a count.
     */
    const announce = (messages: SupportMessage[]) => {
      const { t: translate, tCount: translateCount, router: nav } = latest.current;
      // Ascending, as `listMessagesSince` returns them.
      const newest = messages[messages.length - 1];
      if (!newest) return;

      const sender = senderOf(newest);
      const name = (newest.fullname ?? sender?.fullname ?? '').trim() || translate('support.alerts.unknownSender');
      const text = previewOf(newest.message, ALERT_PREVIEW_CHARS);
      const one = messages.length === 1;

      const line = text
        ? translate('support.alerts.fromName', { name, text })
        : translate('support.alerts.noText', { name });
      const title = one
        ? translate('support.alerts.newMessage')
        : translate('support.alerts.newMessages', { count: messages.length });
      // The bell's own wording for the rest, so the two agree on what is outstanding.
      const body = one ? line : `${line} · ${translateCount('support.alerts.more', messages.length - 1)}`;
      const href = one ? supportMessageHref(newest.objectId) : supportUnreadHref();

      toast(title, {
        description: body,
        variant: 'accent',
        indicator: <ChatIcon className="size-4" />,
        // Longer than the default four seconds: this is a job arriving, not a save
        // confirmation, and it competes with whatever is already on screen.
        timeout: 10_000,
        actionProps: {
          children: translate(one ? 'support.alerts.openMessage' : 'support.alerts.openInbox'),
          onPress: () => nav.push(href),
        },
      });

      if (isAlertChannelEnabled('sound')) playAlertSound();

      // Only when this tab isn't the one being looked at — the toast has already said it
      // to anyone who is, and a notification on top of that is just noise.
      if (isAlertChannelEnabled('desktop') && !document.hasFocus()) {
        showDesktopNotification({
          title,
          body,
          tag: `support-${newest.objectId}`,
          onClick: () => nav.push(href),
        });
      }
    };

    /** Runs for as long as this tab leads, and resolves once `release` aborts. */
    const lead = (release: AbortSignal) =>
      new Promise<void>((resolve) => {
        // Granted after it was already given up (this unmounting at that moment): hand it
        // straight back, or no tab of this browser would ever get it.
        if (release.aborted) {
          resolve();
          return;
        }

        /** This tab's idea of where the inbox has been read up to. Null means "ask the
         * server", either because nothing was saved or because what was is too old. */
        let cursor: AlertCursor | null = readCursor(accountId);
        /** The look in flight. A slow one is not stacked on by the next. */
        let look: { controller: AbortController; startedAt: number } | null = null;

        const tick = async () => {
          if (look || release.aborted) return;
          const current = { controller: new AbortController(), startedAt: Date.now() };
          look = current;

          try {
            // First look of a browser that hasn't watched recently: take the inbox as it
            // stands and watch from there. Everything already in it is backlog.
            if (!cursor) {
              cursor = await newestMessageCursor();
              if (look !== current || release.aborted) return;
              saveCursor(accountId, cursor);
              return;
            }

            const rows = await listMessagesSince(cursor);
            // Abandoned for taking too long, or leadership ended while it ran: say nothing
            // and save nothing. Whoever leads next reads the same rows from the same cursor.
            if (look !== current || release.aborted) return;

            cursor = advanceCursor(cursor, rows);
            // Saved before announcing, so a tab that takes over in between can't announce
            // the same messages a second time.
            saveCursor(accountId, cursor);

            const fresh = rows.filter(
              (row) => isInScope(row, pinnedRegion) && isUnread(latest.current.marks, row),
            );
            if (fresh.length === 0) return;

            refreshBell();
            channel?.postMessage({ type: 'arrived' } satisfies AlertMessage);
            announce(fresh);
          } catch {
            // A look that failed changes nothing: the cursor stays where it was and the
            // next beat asks again. Nothing is shown — an alert is for messages, and a
            // connection that drops for one beat is not news.
          } finally {
            if (look === current) look = null;
          }
        };

        onBeat = () => {
          // Checked on the beat rather than with a timer of its own, which a background
          // tab would throttle to once a minute.
          if (look && Date.now() - look.startedAt > SUPPORT_ALERT_TIMEOUT_MS) {
            look.controller.abort();
            look = null;
          }
          void tick();
        };
        void tick();

        release.addEventListener(
          'abort',
          () => {
            look?.controller.abort();
            look = null;
            onBeat = null;
            resolve();
          },
          { once: true },
        );
      });

    /** This tab's current request for the lock, waiting or held. Aborting it withdraws the
     * request, or ends the leadership it was granted. */
    let attempt: AbortController | null = null;

    /**
     * Waits for the lock, or with `steal`, takes it now from whichever tab holds it.
     *
     * A tab that has the lock stolen sees its request reject, stops leading and waits
     * again — so it takes over in turn when the tab that took it is closed.
     */
    const join = (steal: boolean) => {
      attempt?.abort();
      const mine = new AbortController();
      attempt = mine;
      if (steal) isStealing = true;
      navigator.locks
        // A steal can't carry a signal (the API refuses the pair). It is granted at once,
        // and `mine` ends that leadership like any other.
        .request(LOCK_NAME, steal ? { steal: true } : { signal: mine.signal }, () => {
          isStealing = false;
          return lead(mine.signal);
        })
        // Withdrawn while waiting, or stolen from.
        .catch(() => {
          isStealing = false;
        })
        .finally(() => {
          mine.abort();
          if (attempt === mine && !unmount.signal.aborted) join(false);
        });
    };

    // Leadership follows whoever is being used: the tab someone just came back to is the
    // one that can play a sound and the one where a toast is read. Skipped when this tab
    // already leads, and while a steal it asked for is still being granted.
    const takeOver = () => {
      if (!hasLocks || onBeat || isStealing || document.visibilityState !== 'visible') return;
      join(true);
    };

    window.addEventListener('focus', takeOver);
    document.addEventListener('visibilitychange', takeOver);

    // A tab that opens already focused — a new tab, or a reload — never fires a focus
    // event, so it would leave the alerts with whichever older tab happens to hold the
    // lock. One shot, once the lock has had a moment to come to it on its own: if it now
    // leads, `takeOver` does nothing.
    const initialClaim = window.setTimeout(() => {
      if (document.hasFocus()) takeOver();
    }, 500);

    const stopBeat = startTicker(SUPPORT_ALERT_TICK_MS, () => onBeat?.());

    if (hasLocks) {
      join(false);
    } else {
      // No Web Locks: every tab looks for itself. The cursor is shared, so at worst two
      // tabs announce the same message, and the notification's tag collapses the repeat.
      void lead(unmount.signal);
    }

    return () => {
      unmount.abort();
      attempt?.abort();
      stopBeat();
      window.clearTimeout(initialClaim);
      channel?.close();
      window.removeEventListener('focus', takeOver);
      document.removeEventListener('visibilitychange', takeOver);
      // Signing out shouldn't leave somebody else's support message hanging over the
      // login screen.
      toast.clear();
    };
  }, [isEnabled, accountId, pinnedRegion, queryClient]);

  return null;
}
