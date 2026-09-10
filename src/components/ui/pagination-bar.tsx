'use client';

import type { ReactNode } from 'react';
import { Button } from '@heroui/react';
import { useI18n } from '@/lib/i18n/provider';
import { ELLIPSIS, paginationRange } from './pagination-range';
import { ChevronLeftIcon, ChevronRightIcon } from '@/components/icons';

export function PaginationBar({
  page,
  totalPages,
  isFetching,
  onChange,
}: {
  page: number;
  totalPages: number;
  isFetching: boolean;
  onChange: (page: number) => void;
}) {
  const { t } = useI18n();
  if (totalPages <= 1) return null;

  const items = paginationRange(page, totalPages);

  return (
    <nav
      aria-label={t('orders.pager.label')}
      className="border-separator/70 bg-surface-secondary/40 flex items-center justify-between gap-2 border-t px-4 py-3"
    >
      <PagerButton
        isDisabled={page <= 1 || isFetching}
        onPress={() => onChange(page - 1)}
        aria-label={t('orders.pager.previous')}
      >
        <ChevronLeftIcon className="size-4" />
        <span className="hidden sm:inline">{t('orders.pager.previous')}</span>
      </PagerButton>

      <div className="flex items-center gap-1">
        {items.map((item, index) =>
          item === ELLIPSIS ? (
            <span key={`ellipsis-${index}`} className="text-muted grid size-9 place-items-center">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              aria-label={t('orders.pager.page', { page: item })}
              aria-current={item === page ? 'page' : undefined}
              disabled={isFetching}
              onClick={() => onChange(item)}
              className={
                'text-body tabular focus-visible:ring-focus grid size-9 place-items-center rounded-xl transition-colors outline-none focus-visible:ring-2 disabled:opacity-50 ' +
                (item === page
                  ? 'bg-accent text-accent-foreground font-bold'
                  : 'text-muted hover:bg-surface-tertiary hover:text-foreground')
              }
            >
              {item}
            </button>
          ),
        )}
      </div>

      <PagerButton
        isDisabled={page >= totalPages || isFetching}
        onPress={() => onChange(page + 1)}
        aria-label={t('orders.pager.next')}
      >
        <span className="hidden sm:inline">{t('orders.pager.next')}</span>
        <ChevronRightIcon className="size-4" />
      </PagerButton>
    </nav>
  );
}

function PagerButton({
  children,
  isDisabled,
  onPress,
  ...props
}: {
  children: ReactNode;
  isDisabled: boolean;
  onPress: () => void;
  'aria-label': string;
}) {
  return (
    <Button variant="outline" size="sm" isDisabled={isDisabled} onPress={onPress} {...props}>
      {children}
    </Button>
  );
}
