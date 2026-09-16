'use client';

import { useEffect, useRef } from 'react';
import { useI18n } from '@/lib/i18n/provider';
import { AlertIcon, CheckIcon, CloseIcon } from '@/components/icons';

/**
 * The outcome of an action, under the thing it was done to — the same banner the order
 * actions show. A success fades after a few seconds, because the screen behind it already
 * shows the change; an error stays until dismissed.
 */
export type NoticeValue = { kind: 'success' | 'error'; title: string; body?: string };

export function Notice({ notice, onDismiss }: { notice: NoticeValue; onDismiss: () => void }) {
  const { t } = useI18n();
  // Read through a ref so a parent re-rendering with a new callback doesn't restart the
  // countdown — only a new notice does.
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (notice.kind !== 'success') return;
    const timeout = setTimeout(() => dismissRef.current(), 6000);
    return () => clearTimeout(timeout);
  }, [notice]);

  return (
    <div
      role={notice.kind === 'error' ? 'alert' : 'status'}
      className={
        'flex items-start gap-2 rounded-xl p-2.5 ' +
        (notice.kind === 'error'
          ? 'bg-danger-soft text-danger-soft-foreground'
          : 'bg-success-soft text-success-soft-foreground')
      }
    >
      {notice.kind === 'error' ? (
        <AlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      ) : (
        <CheckIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-caption font-bold">{notice.title}</p>
        {notice.body && <p className="text-caption">{notice.body}</p>}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t('orders.actions.dismiss')}
        className="hover:bg-surface/40 focus-visible:ring-focus grid size-6 shrink-0 place-items-center rounded-lg transition-colors outline-none focus-visible:ring-2"
      >
        <CloseIcon className="size-3.5" />
      </button>
    </div>
  );
}
