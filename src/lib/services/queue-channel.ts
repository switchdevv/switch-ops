import type { MessageKey } from '@/lib/i18n/dictionary';

/**
 * How the console's tabs talk about the driver queue.
 *
 * Only one tab per browser runs the queue (see components/queue-runner.tsx), but every tab
 * shows it. Without this, only the tab that runs it would know when it last looked, why a
 * look failed, or that a look just sent an order — and the others would show a stale line
 * for up to a full refresh. The other direction carries a nudge: a dispatcher who presses
 * Retry now in any tab wants the runner, wherever it is, to look now rather than on its
 * next tick.
 *
 * A `BroadcastChannel` reaches every other channel of the same name in this browser,
 * including other instances in the same tab — which is why the runner listens on its own
 * instance and this module posts from another.
 */

export const QUEUE_CHANNEL = 'switch-ops:dispatch-queue';

export type RunnerMessage =
  /** The leading tab finished a look at `at`. */
  | { type: 'tick'; at: number; changed: boolean; errorKey: MessageKey | null }
  /** Look now. */
  | { type: 'nudge' };

let outbox: BroadcastChannel | null = null;

export function postRunnerMessage(message: RunnerMessage): void {
  if (typeof BroadcastChannel === 'undefined') return;
  outbox ??= new BroadcastChannel(QUEUE_CHANNEL);
  outbox.postMessage(message);
}

/** Asks whichever tab runs the queue to look now. */
export function nudgeQueueRunner(): void {
  postRunnerMessage({ type: 'nudge' });
}
