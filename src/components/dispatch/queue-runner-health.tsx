'use client';

import { useQueueRunnerStatus } from '@/components/queue-runner';
import { useNow } from '@/hooks/use-now';
import { useI18n } from '@/lib/i18n/provider';
import { RUNNER_STALL_MS } from '@/lib/ops/queue';

/**
 * When this browser last looked at the driver queue — or, loudly, that it has stopped.
 *
 * The runner's failures already have a banner, but a look that never finishes (a request
 * that hangs) fails nothing: the runner just waits on it, and every queued order waits
 * with it. Only the time since the last look shows that. Its own component so the
 * one-second clock re-renders a line, not the panel.
 *
 * Counted from when the runner started while no look has finished yet: a queue that has
 * never been looked at is the same failure, and saying nothing at all hid it.
 */
export function QueueRunnerHealth() {
  const { t, format } = useI18n();
  const now = useNow(1000);
  const { lastTickAt, startedAt } = useQueueRunnerStatus();
  const since = lastTickAt ?? startedAt;
  if (since === null) return null;

  if (now - since > RUNNER_STALL_MS) {
    return (
      <span role="alert" className="text-warning-soft-foreground font-bold">
        {t('dispatch.lineUp.runnerStalled', { duration: format.span(now - since) })}
      </span>
    );
  }
  if (lastTickAt === null) return <span>{t('dispatch.lineUp.runnerFirstCheck')}</span>;
  return (
    <span className="tabular">
      {t('dispatch.lineUp.runnerLastCheck', { ago: format.relative(new Date(lastTickAt).toISOString(), now) })}
    </span>
  );
}
