'use client';

import { Chip } from '@heroui/react';
import { useI18n } from '@/lib/i18n/provider';
import { STAGE_TOKEN, stageOf, statusLabelKey } from '@/lib/ops/order-status';
import type { DeliveryType, Order } from '@/types/order';

/**
 * The precise state of one order.
 *
 * Shows the *status* label ("Ready for pickup") in the *stage's* colour — the two are
 * different resolutions of the same fact, and a row needs the exact word while the eye
 * needs the coarse colour it shares with the pipeline bar above.
 *
 * The dot repeats the signal without relying on hue, which is what keeps four soft
 * tinted chips distinguishable for a red-green colourblind dispatcher.
 */
export function StageChip({
  order,
  size = 'sm',
}: {
  order: Pick<Order, 'status' | 'canceled'> & { deliveryType?: DeliveryType };
  size?: 'sm' | 'md' | 'lg';
}) {
  const { t } = useI18n();
  const stage = stageOf(order);

  return (
    <Chip
      color={stage ? STAGE_TOKEN[stage] : 'default'}
      variant="soft"
      size={size}
      className="gap-1.5 ps-2"
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      <Chip.Label>{t(statusLabelKey(order))}</Chip.Label>
    </Chip>
  );
}
