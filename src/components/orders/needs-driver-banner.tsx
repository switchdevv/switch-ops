'use client';

import { Button } from '@heroui/react';
import { useI18n } from '@/lib/i18n/provider';
import { AlertIcon } from '@/components/icons';

/**
 * The one thing on this page that is an alarm rather than information.
 *
 * A delivery with no driver is the only state on the board where nothing at all is
 * happening and nobody outside this room can fix it — the restaurant has cooked, the
 * customer is waiting, and the order is sitting still. So it gets its own strip above
 * the fold with the action attached, and it disappears entirely when the number is
 * zero rather than sitting there as a permanent green "0" that trains people to ignore
 * the space it occupies.
 */
export function NeedsDriverBanner({
  count,
  isFiltered,
  onShow,
}: {
  count: number | undefined;
  /** The board is already narrowed to exactly these orders — nothing left to offer. */
  isFiltered: boolean;
  onShow: () => void;
}) {
  const { tCount } = useI18n();
  const { t } = useI18n();

  if (!count) return null;

  return (
    <div
      role="status"
      className="border-danger/30 bg-danger-soft text-danger-soft-foreground flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3"
    >
      <AlertIcon aria-hidden className="size-5 shrink-0" />
      <p className="text-body flex-1 font-bold">{tCount('orders.alert.unassigned', count)}</p>
      {!isFiltered && (
        <Button variant="secondary" size="sm" onPress={onShow}>
          {t('orders.alert.unassignedAction')}
        </Button>
      )}
    </div>
  );
}
