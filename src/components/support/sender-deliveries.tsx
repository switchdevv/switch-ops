'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Skeleton } from '@heroui/react';
import { useSenderDeliveries } from '@/hooks/use-support';
import { shortId } from '@/lib/format';
import { useI18n } from '@/lib/i18n/provider';
import { RELATIVE_GAP_MAX_MS } from '@/lib/ops/support';
import { parseErrorKey } from '@/lib/parse/errors';
import { ordersHref } from '@/lib/url/order-filters';
import type { OrderRow } from '@/types/order';
import { EditOrderDialog } from '@/components/orders/order-actions';
import { StageChip } from '@/components/ui/stage-chip';
import { CheckIcon, PencilIcon } from '@/components/icons';

/**
 * The deliveries behind a driver's message.
 *
 * What a driver writes to support is almost always about the order in their hand — "the
 * total is 1600", "he added a dish", "the customer isn't answering" — and what ops do about
 * it is correct that order. So the orders they were carrying when they wrote sit under the
 * message with the money on them, and Edit opens the board's own dialog here rather than
 * sending anyone to another page and back.
 *
 * The list is anchored on the message, not on now (see `listSenderDeliveries`), and says so
 * by timing each order against it. Nothing here claims to know *which* order was in hand:
 * the platform stamps an order only with when the customer placed it, so the top row is the
 * likeliest and the gaps let the person reading judge the rest.
 */
export function SenderDeliveries({
  driverId,
  messageAt,
  pinnedRegion,
}: {
  driverId: string;
  /** The message's `createdAt` — the moment the list is read up to. */
  messageAt: string;
  pinnedRegion: string;
}) {
  const { t } = useI18n();
  const query = useSenderDeliveries(driverId, messageAt, pinnedRegion);
  const [editing, setEditing] = useState<OrderRow | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const orders = query.data ?? [];

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-micro text-muted font-bold tracking-[0.1em] uppercase">
          {t('support.reader.deliveries')}
        </h3>
        <Link href={ordersHref('driver', driverId)} className={TEXT_LINK}>
          {t('support.reader.allDeliveries')}
        </Link>
      </div>

      {query.status === 'pending' ? (
        <Skeleton className="h-20 w-full rounded-2xl" />
      ) : query.status === 'error' ? (
        <p className="text-caption text-danger">{t(parseErrorKey(query.error, 'fetch'))}</p>
      ) : orders.length === 0 ? (
        <p className="text-caption text-faint">{t('support.reader.noDeliveries')}</p>
      ) : (
        <>
          <ul className="border-border/70 divide-separator/70 divide-y overflow-hidden rounded-2xl border">
            {orders.map((order) => (
              <DeliveryRow
                key={order.objectId}
                order={order}
                messageAt={messageAt}
                onEdit={() => {
                  setSaved(null);
                  setEditing(order);
                }}
              />
            ))}
          </ul>
          <p className="text-micro text-faint">{t('support.reader.deliveriesHint')}</p>
        </>
      )}

      {saved && (
        <p className="text-caption text-success-soft-foreground bg-success-soft flex items-center gap-1.5 rounded-xl px-2.5 py-2 font-bold">
          <CheckIcon aria-hidden className="size-3.5 shrink-0" />
          {t('support.reader.orderSaved', { order: shortId(saved) })}
        </p>
      )}

      {editing && (
        <EditOrderDialog
          order={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setSaved(editing.objectId);
            setEditing(null);
            // The corrected total is the thing ops came here to see.
            void query.refetch();
          }}
        />
      )}
    </section>
  );
}

const TEXT_LINK =
  'text-caption text-link inline-flex items-center gap-1 font-bold hover:underline focus-visible:ring-focus rounded outline-none focus-visible:ring-2';

function DeliveryRow({
  order,
  messageAt,
  onEdit,
}: {
  order: OrderRow;
  messageAt: string;
  onEdit: () => void;
}) {
  const { t, format } = useI18n();
  const currency = order.city?.currency;
  const options = order.options ?? {};
  const method = options.paymentMethod;

  // Placed how long before those words. Past a shift the span stops meaning anything, so
  // the order's own date is shown instead.
  const gap = new Date(messageAt).getTime() - new Date(order.createdAt).getTime();
  const when =
    Number.isFinite(gap) && gap >= 0 && gap <= RELATIVE_GAP_MAX_MS
      ? `${format.clock(order.createdAt)} · ${t('support.reader.placedBefore', {
          span: format.elapsed(order.createdAt, new Date(messageAt).getTime()),
        })}`
      : format.dateTime(order.createdAt);

  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={ordersHref('objectId', order.objectId)}
            className="text-caption tabular hover:text-link focus-visible:ring-focus rounded font-bold outline-none focus-visible:ring-2"
          >
            #{shortId(order.objectId)}
          </Link>
          <StageChip order={order} />
        </div>
        <p className="text-caption min-w-0 truncate">
          <bdi>{order.restaurant?.name ?? t('common.none')}</bdi>
          <span aria-hidden className="text-faint"> → </span>
          <bdi>{order.user?.fullname ?? t('common.none')}</bdi>
        </p>
        <p className="text-micro text-faint tabular" title={format.dateTime(order.createdAt)}>
          {when}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="text-body tabular font-bold">{format.money(options.total, currency)}</span>
        <span className="text-micro text-faint">
          {method === 'cash'
            ? t('orders.detail.cash')
            : method === 'creditcards'
              ? t('orders.detail.creditcards')
              : t('orders.detail.unknownMethod')}
        </span>
        <Button variant="secondary" size="sm" className="h-7" onPress={onEdit}>
          <PencilIcon aria-hidden className="size-3.5" />
          {t('orders.actions.edit')}
        </Button>
      </div>
    </li>
  );
}
