export const ELLIPSIS = 'ellipsis' as const;
export type PaginationItem = number | typeof ELLIPSIS;

/**
 * Pure by design (no React, no HeroUI) so it is trivially testable on its own.
 * Always includes the first and last page, plus up to `siblings` pages on each side of
 * `current`, collapsing any gap larger than one page into a single ellipsis.
 */
export function paginationRange(
  current: number,
  totalPages: number,
  siblings = 1,
): PaginationItem[] {
  if (totalPages <= 0) return [1];

  const start = Math.max(2, current - siblings);
  const end = Math.min(totalPages - 1, current + siblings);

  const items: PaginationItem[] = [1];

  if (start > 2) items.push(ELLIPSIS);
  for (let page = start; page <= end; page++) items.push(page);
  if (end < totalPages - 1) items.push(ELLIPSIS);

  if (totalPages > 1) items.push(totalPages);

  return items;
}
