'use client';

import { useEffect } from 'react';

/**
 * Brings a list back onto a page that exists.
 *
 * A page past the end — a pasted or remembered link, the last row of the last page deleted,
 * or (on a live list) rows that moved out of the filter since the page was opened — would
 * otherwise show the list's empty state over rows that do exist. Only once the answer for
 * this page has landed (`isSettled`): placeholder rows still describe the previous request.
 *
 * Returns whether the page is past the end, so the list can show it is loading rather than
 * flash "nothing here" for the one render before the move.
 */
export function usePageInRange({
  page,
  total,
  pageSize,
  isSettled,
  onPageChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  isSettled: boolean;
  onPageChange: (page: number) => void;
}): boolean {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  const isPastEnd = isSettled && page > lastPage;

  useEffect(() => {
    if (isPastEnd) onPageChange(lastPage);
  }, [isPastEnd, lastPage, onPageChange]);

  return isPastEnd;
}
