'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '@/lib/i18n/provider';
import { CheckIcon, CopyIcon } from '@/components/icons';

/**
 * A monospace-ish id with a copy button attached.
 *
 * Copying ids is most of what anyone does on this screen — every action in the staff
 * dashboard (assign a driver, cancel an order, look up a restaurant) is performed by
 * pasting one somewhere else. Making them selectable text and leaving it at that means
 * a triple-click that grabs the label too.
 */
export function CopyValue({
  value,
  label,
  prefix = '#',
  className,
}: {
  value: string;
  /** Announced on the button, e.g. "Copy ID". */
  label?: string;
  prefix?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Without this, unmounting the row mid-timeout (a refresh tick replacing the list)
  // leaves a setState pointed at a component that is gone.
  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (timeout.current) clearTimeout(timeout.current);
      timeout.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // `navigator.clipboard` is undefined outside a secure context — the console over
      // plain http on a LAN address, which is how it gets demoed. Nothing to say about
      // it beyond not crashing: the id is still on screen to select by hand.
    }
  }, [value]);

  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ''}`}>
      <span className="tabular truncate">
        {prefix}
        {value}
      </span>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? t('common.copied') : (label ?? t('common.copy'))}
        title={copied ? t('common.copied') : (label ?? t('common.copy'))}
        className="text-faint hover:text-foreground focus-visible:ring-focus grid size-5 shrink-0 place-items-center rounded-md transition-colors outline-none focus-visible:ring-2"
      >
        {copied ? (
          <CheckIcon className="text-success size-3.5" />
        ) : (
          <CopyIcon className="size-3.5" />
        )}
      </button>
    </span>
  );
}
