'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Chip } from '@heroui/react';
import { splitPhones } from '@/lib/format';
import { useI18n } from '@/lib/i18n/provider';
import { customerStatusOf, isStaffTagged } from '@/lib/ops/customers';
import { customerHref } from '@/lib/url/customer-filters';
import type { CustomerRow } from '@/types/customer';
import { Notice, type NoticeValue } from '@/components/ui/notice';
import { Tag, Thumb } from '@/components/restaurants/restaurant-bits';
import { CalendarIcon, MapPinIcon, PhoneIcon } from '@/components/icons';
import { CustomerActions } from './customer-actions';

/** One customer: who and how to reach them on the left, their account state, and the
 * actions behind ⋯. The name opens their page. */
export function CustomerListRow({
  customer,
  regionName,
  isSelf,
}: {
  customer: CustomerRow;
  regionName: string | undefined;
  isSelf: boolean;
}) {
  const { t, format } = useI18n();
  const [notice, setNotice] = useState<NoticeValue | null>(null);
  const status = customerStatusOf(customer);
  const phone = splitPhones(customer.phone)[0];
  const name = customer.fullname || customer.username || t('common.none');

  return (
    <li className="border-separator/70 flex flex-col gap-2 border-b px-3 py-3 last:border-b-0 sm:px-4">
      <div className="flex items-center gap-3 sm:gap-4">
        <Thumb picture={customer.picture} name={customer.fullname ?? customer.username} className="size-10 rounded-full" />

        <div className="flex min-w-0 flex-1 flex-col gap-1 leading-tight">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={customerHref(customer.objectId)}
              className="text-body hover:text-link focus-visible:ring-focus truncate rounded font-bold outline-none focus-visible:ring-2"
            >
              {name}
            </Link>
            {isSelf && <Tag tone="accent">{t('customers.row.you')}</Tag>}
            {isStaffTagged(customer) && <Tag tone="warning">{t('customers.row.staffAccount')}</Tag>}
            {customer.managerStore && <Tag tone="muted">{t('customers.row.manager')}</Tag>}
            {customer.appType?.includes('driver') && <Tag tone="muted">{t('customers.row.driver')}</Tag>}
          </div>

          <div className="text-caption text-muted flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5">
            {customer.username && <span className="truncate">@{customer.username}</span>}
            {phone && (
              <span className="tabular inline-flex items-center gap-1 whitespace-nowrap">
                <PhoneIcon aria-hidden className="size-3.5" />
                {phone}
              </span>
            )}
            <span className="inline-flex items-center gap-1 whitespace-nowrap">
              <MapPinIcon aria-hidden className="size-3.5" />
              {regionName ?? t('customers.row.noRegion')}
            </span>
            <span className="hidden items-center gap-1 whitespace-nowrap sm:inline-flex">
              <CalendarIcon aria-hidden className="size-3.5" />
              {t('customers.row.joined', { date: format.date(customer.createdAt) })}
            </span>
          </div>
        </div>

        <Chip color={status === 'enabled' ? 'success' : 'danger'} variant="soft" size="sm" className="hidden shrink-0 gap-1.5 ps-2 sm:inline-flex">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
          <Chip.Label>{t(status === 'enabled' ? 'customers.status.enabled' : 'customers.status.disabled')}</Chip.Label>
        </Chip>

        <div className="shrink-0">
          <CustomerActions customer={customer} variant="row" onNotice={setNotice} />
        </div>
      </div>

      {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}
    </li>
  );
}
