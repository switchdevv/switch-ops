'use client';

import { useQueueRunnerStatus } from '@/components/queue-runner';
import { AlertIcon } from '@/components/icons';
import { useNow } from '@/hooks/use-now';
import { useI18n } from '@/lib/i18n/provider';
import { RUNNER_STALL_MS } from '@/lib/ops/queue';

/**
 * When this browser last looked at the driver queue — or, loudly, that it has stopped.
 *
 * The runner's failures already have a banner, but a look that never finishes (a request
 * that hangs) fails nothing: the runner just waits on it, and every queued order waits
 * with it. Only the time since the last look shows that. Its own components so the
 * one-second clock re-renders a line, not the panel.
 *
 * Counted from when the runner started while no look has finished yet: a queue that has
 * never been looked at is the same failure, and saying nothing at all hid it.
 *
 * Two halves, because they belong in different places: the stall is an alarm and heads
 * the panel, where it can't be scrolled out of sight; the last look is reassurance, and
 * sits with the list's other footnotes.
 */
function useRunnerHealth() {
  const now = useNow(1000);
  const { lastTickAt, startedAt } = useQueueRunnerStatus();
  const since = lastTickAt ?? startedAt;
  return { now, lastTickAt, since, isStalled: since !== null && now - since > RUNNER_STALL_MS };
}

/** The alarm. Mount it only while an order is queued — with none, nothing is waiting. */
export function QueueRunnerStallBanner() {
  const { t, format } = useI18n();
  const { now, since, isStalled } = useRunnerHealth();
  if (!isStalled || since === null) return null;

  return (
    <p
      role="alert"
      className="text-caption bg-warning-soft text-warning-soft-foreground border-separator/70 flex items-start gap-2 border-b px-3 py-2 font-bold"
    >
      <AlertIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
      {t('dispatch.lineUp.runnerStalled', { duration: format.span(now - since) })}
    </p>
  );
}

/** The reassurance. Says nothing while stalled — the banner is saying it. */
export function QueueRunnerHealth() {
  const { t, format } = useI18n();
  const { now, lastTickAt, since, isStalled } = useRunnerHealth();
  if (since === null || isStalled) return null;

  if (lastTickAt === null) return <span>{t('dispatch.lineUp.runnerFirstCheck')}</span>;
  return (
    <span className="tabular">
      {t('dispatch.lineUp.runnerLastCheck', { ago: format.relative(new Date(lastTickAt).toISOString(), now) })}
    </span>
  );
}
