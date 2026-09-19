'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAccess } from '@/hooks/use-access';
import { invalidateQueueFromRunner } from '@/hooks/use-queue';
import { pinnedRegionId } from '@/lib/auth/access';
import type { MessageKey } from '@/lib/i18n/dictionary';
import { QUEUE_TICK_MS, RUNNER_STALL_MS, TICK_TIMEOUT_MS } from '@/lib/ops/queue';
import { parseErrorKey } from '@/lib/parse/errors';
import { runQueueTick } from '@/lib/services/queue';
import { postRunnerMessage, QUEUE_CHANNEL, type RunnerMessage } from '@/lib/services/queue-channel';
import { startTicker } from '@/lib/worker-ticker';

/**
 * Sends each driver's next queued order the moment they are free. Renders nothing.
 *
 * Mounted once, in the dashboard layout, so it runs on every page of the console, not only
 * while the map is open. Three things make that reliable:
 *
 * - **One runner per browser.** Every tab of the console mounts this, but only the tab
 *   holding a Web Lock runs it. When that tab closes, the lock passes to the next. Across
 *   browsers (two dispatchers, two machines) each runs its own, and `claimEntry` in
 *   lib/services/queue.ts makes sure an order is sent only once however many are looking.
 * - **A timer that survives a background tab.** Chrome throttles timers in a tab that has
 *   been hidden for a few minutes down to one wake-up a minute, and this console spends
 *   its evenings in a background tab — so the beat comes from a worker, which is exempt
 *   (lib/worker-ticker.ts).
 * - **The account's own scope.** An admin's runner handles every region; a staff
 *   account's handles its own. A queue in a region nobody with the console open can see
 *   waits for someone who can.
 *
 * The leading tab tells the others about every look over lib/services/queue-channel.ts —
 * when, whether it failed, whether it changed anything — so every tab can show that the
 * queue is being looked at, and refresh the moment an order goes out. The others can ask
 * it to look now.
 *
 * Holding the lock is not the same as looking, and nothing may depend on the leader
 * staying healthy. A look stuck on a request that never answers is abandoned after
 * `TICK_TIMEOUT_MS`. A tab that hears no finished look for `RUNNER_STALL_MS` steals the
 * lock, whatever became of the tab holding it (asleep, frozen, or stuck), and the tab
 * it was stolen from goes back to waiting its turn. Without that, a queued order could sit
 * behind a free driver for as long as a dead tab stayed open.
 *
 * The one thing it can't do is run with no console open at all. The panel says so.
 */

const LOCK_NAME = 'switch-ops:dispatch-queue';

/* ---- what the panel can know about it -------------------------------------------- */

export type QueueRunnerStatus = {
  /** This tab is the one sending. Another tab of this browser may be instead. */
  isLeader: boolean;
  /** The last tick failed, and why — cleared by the next one that doesn't. */
  errorKey: MessageKey | null;
  /** Epoch ms the last look in this browser finished, whichever tab took it. Null until
   * the first one does. */
  lastTickAt: number | null;
  /** Epoch ms this tab's runner started, leading or waiting its turn — what "not checked
   * for …" counts from before any look has finished. Null while it isn't running. */
  startedAt: number | null;
};

const IDLE: QueueRunnerStatus = { isLeader: false, errorKey: null, lastTickAt: null, startedAt: null };

let status: QueueRunnerStatus = IDLE;
const listeners = new Set<() => void>();

function setStatus(patch: Partial<QueueRunnerStatus>) {
  const next = { ...status, ...patch };
  if (
    next.isLeader === status.isLeader &&
    next.errorKey === status.errorKey &&
    next.lastTickAt === status.lastTickAt &&
    next.startedAt === status.startedAt
  ) {
    return;
  }
  status = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useQueueRunnerStatus(): QueueRunnerStatus {
  return useSyncExternalStore(
    subscribe,
    () => status,
    () => IDLE,
  );
}

/* ---- the runner ------------------------------------------------------------------ */

export function QueueRunner() {
  const queryClient = useQueryClient();
  const { region: scope, role } = useAccess();
  const isEnabled = role !== null && scope.kind !== 'unassigned';
  const region = pinnedRegionId(scope);

  useEffect(() => {
    if (!isEnabled) return;
    const unmount = new AbortController();
    const hasLocks = typeof navigator !== 'undefined' && 'locks' in navigator;
    /** Set while this tab leads: looks now, or straight after the look in flight. */
    let lookNow: (() => void) | null = null;
    /** Set while this tab leads: what the worker's beat does. */
    let onBeat: (() => void) | null = null;
    /** The last time this tab knew the queue was being looked at: a look finishing in any
     * tab of this browser, or this tab joining the wait for the lock. */
    let heardAt = Date.now();
    setStatus({ startedAt: heardAt });

    const inbox = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(QUEUE_CHANNEL);
    if (inbox) {
      inbox.onmessage = (event: MessageEvent<RunnerMessage>) => {
        const message = event.data;
        if (message.type === 'nudge') {
          lookNow?.();
          return;
        }
        heardAt = Math.max(heardAt, message.at);
        // The leader's own looks reach its own inbox too, and it has already applied them.
        if (lookNow) return;
        setStatus({ lastTickAt: message.at, errorKey: message.errorKey });
        if (message.changed) invalidateQueueFromRunner(queryClient);
      };
    }

    /** Runs for as long as this tab leads, and resolves once `release` aborts. */
    const lead = (release: AbortSignal) =>
      new Promise<void>((resolve) => {
        // Granted after it was already given up (the runner unmounting at that moment):
        // hand the lock straight back, or no tab of this browser would ever get it.
        if (release.aborted) {
          resolve();
          return;
        }

        /** The look in flight. A slow one (a claim, a send) is not stacked on by the next. */
        let look: { controller: AbortController; startedAt: number } | null = null;
        let isAskedAgain = false;

        const report = (changed: boolean, errorKey: MessageKey | null) => {
          const at = Date.now();
          heardAt = at;
          setStatus({ errorKey, lastTickAt: at });
          postRunnerMessage({ type: 'tick', at, changed, errorKey });
        };

        const tick = async () => {
          if (look || release.aborted) return;
          const current = { controller: new AbortController(), startedAt: Date.now() };
          look = current;
          let changed = false;
          let errorKey: MessageKey | null = null;
          try {
            ({ changed } = await runQueueTick(region, current.controller.signal));
            if (changed) invalidateQueueFromRunner(queryClient);
          } catch (error) {
            errorKey = parseErrorKey(error, 'queue');
          }
          // Abandoned for taking too long: that was reported when it was given up, and a
          // newer look may be running now.
          if (look !== current) return;
          look = null;
          if (release.aborted) return;
          report(changed, errorKey);
          // A nudge that arrived mid-look was about rows that look may have read before
          // the change, so it gets a look of its own.
          if (isAskedAgain) {
            isAskedAgain = false;
            void tick();
          }
        };

        lookNow = () => {
          if (look) isAskedAgain = true;
          else void tick();
        };
        onBeat = () => {
          // Checked on the worker's beat rather than with a timer of its own, which a
          // background tab would throttle to once a minute.
          if (look && Date.now() - look.startedAt > TICK_TIMEOUT_MS) {
            look.controller.abort();
            look = null;
            // A request that never answered: the connection, as far as anyone can tell.
            report(false, 'errors.network');
          }
          void tick();
        };
        setStatus({ isLeader: true });
        void tick();

        release.addEventListener(
          'abort',
          () => {
            look?.controller.abort();
            look = null;
            lookNow = null;
            onBeat = null;
            setStatus({ isLeader: false });
            resolve();
          },
          { once: true },
        );
      });

    /** This tab's current request for the lock, waiting or held. Aborting it withdraws
     * the request, or ends the leadership it was granted. */
    let attempt: AbortController | null = null;

    /**
     * Waits for the lock, or with `steal`, takes it now from whichever tab holds it.
     *
     * A tab that has the lock stolen sees its request reject. It stops leading and waits
     * again, so it can take over in turn should the thief go quiet.
     */
    const join = (steal: boolean) => {
      attempt?.abort();
      const mine = new AbortController();
      attempt = mine;
      heardAt = Date.now();
      navigator.locks
        // A steal can't carry a signal (the API refuses the pair). It is granted at once,
        // and `mine` ends it like any other leadership.
        .request(LOCK_NAME, steal ? { steal: true } : { signal: mine.signal }, () => lead(mine.signal))
        // Withdrawn while waiting, or stolen from.
        .catch(() => undefined)
        .finally(() => {
          mine.abort();
          if (attempt === mine && !unmount.signal.aborted) join(false);
        });
    };

    const stopBeat = startTicker(QUEUE_TICK_MS, () => {
      if (onBeat) onBeat();
      else if (hasLocks && Date.now() - heardAt > RUNNER_STALL_MS) join(true);
    });

    if (hasLocks) {
      join(false);
    } else {
      // No Web Locks: every tab runs, and the claim alone keeps each order sent once.
      void lead(unmount.signal);
    }

    return () => {
      unmount.abort();
      attempt?.abort();
      stopBeat();
      inbox?.close();
      setStatus({ startedAt: null });
    };
  }, [isEnabled, region, queryClient]);

  return null;
}
