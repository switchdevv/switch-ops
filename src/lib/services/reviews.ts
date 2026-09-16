import { findWithCount, pointer, type PageResult } from '@/lib/parse/query';
import type { ReviewFilters } from '@/lib/url/restaurant-filters';
import type { Review } from '@/types/restaurant';

export const REVIEW_PAGE_SIZE = 25;

/**
 * One page of a restaurant's customer reviews, newest first — read-only here, as
 * switch-dashboard's Reviews page lists them (src/pages/Reviews/Reviews.jsx).
 */
export function listReviews(restaurantId: string, filters: ReviewFilters, page: number): Promise<PageResult<Review>> {
  return findWithCount<Review>('Review', [
    { equalTo: { key: 'restaurant', value: pointer('Restaurant', restaurantId) } },
    filters.rating ? { equalTo: { key: 'rating', value: Number(filters.rating) } } : {},
    { include: 'user' },
    { descending: 'createdAt' },
    { limit: REVIEW_PAGE_SIZE },
    { skip: (page - 1) * REVIEW_PAGE_SIZE },
  ]);
}
