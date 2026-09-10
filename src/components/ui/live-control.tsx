'use client';

import { Button, Tooltip } from '@heroui/react';
import { useI18n } from '@/lib/i18n/provider';
import { RefreshIcon } from '@/components/icons';

/**
 * The auto-refresh switch, and the promise it makes. Shared by the orders board and the
 * live map, which both re-read on a timer.
 *
 * A board that silently reloads itself is unnerving — rows move while you read them
 * and there is no way to tell whether what you are looking at is a minute old or an
 * hour. So the state is stated: a breathing dot while it is armed, a still one when
 * paused, and the age of the data in words next to it. Pausing is offered because
 * reading a long order out over the phone while the list reshuffles is the single most
 * annoying thing a live view can do to you.
 */
export function LiveControl({
  isLive,
  onToggle,
  onRefresh,
  isFetching,
  updatedAt,
  now,
}: {
  isLive: boolean;
  onToggle: () => void;
  onRefresh: () => void;
  isFetching: boolean;
  /** Epoch ms of the last successful load, or 0 before the first one. */
  updatedAt: number;
  now: number;
}) {
  const { t, format } = useI18n();

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={isLive}
        title={t(isLive ? 'orders.live.toggleOff' : 'orders.live.toggleOn')}
        className={
          'text-caption focus-visible:ring-focus flex h-9 items-center gap-2 rounded-xl border px-3 font-bold transition-colors outline-none focus-visible:ring-2 ' +
          (isLive
            ? 'border-success/40 bg-success-soft text-success-soft-foreground'
            : 'border-border/70 bg-surface-secondary text-muted hover:text-foreground')
        }
      >
        <span aria-hidden className="relative grid size-2 place-items-center">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: isLive ? 'var(--success)' : 'var(--faint)' }}
          />
          {isLive && (
            <span
              className="ops-ping absolute size-2 rounded-full"
              style={{ backgroundColor: 'var(--success)' }}
            />
          )}
        </span>
        {t(isLive ? 'orders.live.on' : 'orders.live.off')}
      </button>

      <span className="text-caption text-faint hidden tabular sm:inline">
        {isFetching
          ? t('orders.live.refreshing')
          : updatedAt === 0
            ? t('orders.live.never')
            : t('orders.live.updated', { time: format.relative(new Date(updatedAt).toISOString(), now) })}
      </span>

      <Tooltip>
        <Button
          variant="outline"
          size="sm"
          isIconOnly
          className="h-9"
          aria-label={t('orders.live.refresh')}
          isDisabled={isFetching}
          onPress={onRefresh}
        >
          <RefreshIcon className={'size-4 ' + (isFetching ? 'animate-spin' : '')} />
        </Button>
        <Tooltip.Content>{t('orders.live.refresh')}</Tooltip.Content>
      </Tooltip>
    </div>
  );
}
