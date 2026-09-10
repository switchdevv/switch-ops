'use client';

import { useI18n } from '@/lib/i18n/provider';
import { readBasket } from '@/lib/ops/basket';
import type { CurrencyCode } from '@/types/city';
import type { OrderRow } from '@/types/order';
import { CardIcon, CashIcon, TagIcon } from '@/components/icons';

/**
 * What was ordered and what it cost — the two halves of an order that read the same
 * wherever they are shown. The board lays them out side by side under a row; the live
 * map stacks them in its narrow panel. Each caller supplies its own frame and heading,
 * so neither layout has to know about the other.
 */

type ContentsProps = {
  order: Pick<OrderRow, 'food' | 'options' | 'deliveryType' | 'promo'>;
  currency: CurrencyCode | undefined;
};

export function OrderBasket({ order, currency }: ContentsProps) {
  const { t, format } = useI18n();
  const lines = readBasket(order);

  if (lines.length === 0) {
    return <p className="text-body text-muted">{t('orders.detail.basketEmpty')}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {lines.map((line) => (
        <li key={line.key} className="border-separator/70 flex gap-3 border-b pb-3 last:border-b-0 last:pb-0">
          <span className="bg-surface-tertiary text-caption tabular grid h-6 shrink-0 place-items-center rounded-md px-1.5 font-bold">
            {t('orders.detail.quantity', { count: line.quantity })}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-body font-bold">{line.name ?? t('common.none')}</span>
              <span className="text-body tabular shrink-0">{format.money(line.price, currency)}</span>
            </div>

            {line.variants.length > 0 && (
              <p className="text-caption text-muted mt-0.5">
                {line.variants.map((variant) => `${variant.name}: ${variant.value}`).join(' · ')}
              </p>
            )}

            {line.supplements.length > 0 && (
              <p className="text-caption text-muted mt-0.5">
                <span className="font-bold">{t('orders.detail.supplements')}: </span>
                {line.supplements.join(', ')}
              </p>
            )}

            {line.note && (
              <p className="text-caption text-warning-soft-foreground mt-0.5">
                <span className="font-bold">{t('orders.detail.lineNote')}: </span>
                {line.note}
              </p>
            )}

            {!line.isResolved && (
              <p className="text-caption text-danger mt-0.5">{t('orders.detail.basketUnresolved')}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function OrderPayment({ order, currency }: ContentsProps) {
  const { t, format } = useI18n();
  const options = order.options;
  const isPickup = order.deliveryType === 'pickup';

  // One element rather than a fragment: the map's panel stacks its children with a gap,
  // which would otherwise land between the figures and the method line below them.
  return (
    <div>
      <dl className="flex flex-col gap-1">
        <MoneyRow label={t('orders.detail.itemsTotal')} value={format.money(options?.itemsTotal, currency)} />
        {!!options?.discount && (
          <MoneyRow
            label={t('orders.detail.discount')}
            value={`−${format.money(options.discount, currency)}`}
            tone="danger"
          />
        )}
        {!isPickup && (
          <MoneyRow
            label={t('orders.detail.deliveryFee')}
            value={format.money(options?.delivery, currency)}
            // A free-delivery promo means the platform absorbed the fee rather than the
            // customer paying it, so the number stays visible but the tag says who
            // actually bore it.
            badge={options?.freeDelivery ? t('orders.detail.freeDelivery') : undefined}
          />
        )}
        <MoneyRow label={t('orders.detail.service')} value={format.money(options?.service, currency)} />
        <div className="border-separator mt-1.5 border-t pt-1.5">
          <MoneyRow label={t('orders.detail.total')} value={format.money(options?.total, currency)} isStrong />
        </div>
      </dl>

      {/* Method and promo as one caption line rather than a row of chips: this panel is
          three numbers and a total, and a chip row grows it by half its own height to say
          "Cash". */}
      <p className="text-caption text-muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1.5">
          {options?.paymentMethod === 'creditcards' ? (
            <CardIcon className="size-3.5" />
          ) : (
            <CashIcon className="size-3.5" />
          )}
          {options?.paymentMethod
            ? t(`orders.detail.${options.paymentMethod}`)
            : t('orders.detail.unknownMethod')}
        </span>
        {order.promo?.code && (
          <span className="text-accent-soft-foreground inline-flex items-center gap-1.5 font-bold">
            <TagIcon className="size-3.5" />
            {order.promo.code}
          </span>
        )}
      </p>
    </div>
  );
}

/**
 * One line of the payment breakdown, at caption size — the panel is a column of numbers
 * whose only job is to add up to the total, and the total is the one line that gets read
 * from across the desk.
 */
function MoneyRow({
  label,
  value,
  tone,
  badge,
  isStrong,
}: {
  label: string;
  value: string;
  tone?: 'danger';
  badge?: string;
  isStrong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className={isStrong ? 'text-body font-bold' : 'text-caption text-muted'}>
        {label}
        {badge && (
          <span className="bg-success-soft text-success-soft-foreground text-micro ms-1.5 rounded px-1 py-0.5 font-bold">
            {badge}
          </span>
        )}
      </dt>
      <dd
        className={
          'tabular shrink-0 ' +
          (isStrong ? 'text-body font-bold ' : 'text-caption ') +
          (tone === 'danger' ? 'text-danger' : '')
        }
      >
        {value}
      </dd>
    </div>
  );
}
