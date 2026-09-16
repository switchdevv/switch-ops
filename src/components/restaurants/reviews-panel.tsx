'use client';

import { Button } from '@heroui/react';
import { useReviews } from '@/hooks/use-menus';
import { useI18n } from '@/lib/i18n/provider';
import { REVIEW_PAGE_SIZE } from '@/lib/services/reviews';
import { REVIEW_RATINGS, type ReviewFilters } from '@/lib/url/restaurant-filters';
import type { RestaurantRow, Review } from '@/types/restaurant';
import { ListEmpty, PagedList } from '@/components/ui/paged-list';
import { SelectField } from '@/components/ui/select-field';
import { StarIcon } from '@/components/icons';
import { Thumb } from './restaurant-bits';

/** What customers said about a restaurant — read-only, newest first. */
export function ReviewsPanel({
  restaurant,
  filters,
  page,
  onFiltersChange,
  onPageChange,
}: {
  restaurant: RestaurantRow;
  filters: ReviewFilters;
  page: number;
  onFiltersChange: (filters: ReviewFilters) => void;
  onPageChange: (page: number) => void;
}) {
  const { t, format } = useI18n();
  const query = useReviews(restaurant.objectId, filters, page);
  const rows = query.data?.results ?? [];

  return (
    <div className="flex flex-col gap-4">
      <section className="border-border/70 bg-surface rounded-card shadow-card flex flex-wrap items-end justify-between gap-3 border p-4 sm:p-5">
        <SelectField
          label={t('catalogue.reviews.rating')}
          value={filters.rating}
          options={[
            { value: '', label: t('catalogue.reviews.anyRating') },
            ...REVIEW_RATINGS.map((rating) => ({ value: rating, label: t('catalogue.reviews.stars', { count: rating }) })),
          ]}
          onChange={(rating) => onFiltersChange({ rating: rating as ReviewFilters['rating'] })}
          className="w-44"
        />
        <p className="text-caption text-muted tabular flex items-center gap-1.5">
          <StarIcon aria-hidden className="size-3.5" />
          {t('catalogue.reviews.summary', {
            rating: restaurant.rating ? format.number(Math.round(restaurant.rating * 10) / 10) : t('common.none'),
            count: format.number(restaurant.reviews ?? 0),
          })}
        </p>
      </section>

      <PagedList
        status={query.status}
        error={query.error}
        isPlaceholderData={query.isPlaceholderData}
        isFetching={query.isFetching}
        page={page}
        pageSize={REVIEW_PAGE_SIZE}
        total={query.data?.count ?? 0}
        rowCount={rows.length}
        errorTitle={t('catalogue.reviews.error')}
        onRetry={() => void query.refetch()}
        onPageChange={onPageChange}
        empty={
          <ListEmpty
            title={t('catalogue.reviews.emptyTitle')}
            body={t(filters.rating ? 'catalogue.reviews.emptyFiltered' : 'catalogue.reviews.emptyBody')}
            actions={
              filters.rating ? (
                <Button variant="secondary" size="sm" onPress={() => onFiltersChange({ rating: '' })}>
                  {t('orders.empty.clear')}
                </Button>
              ) : undefined
            }
          />
        }
      >
        {rows.map((review) => (
          <ReviewRow key={review.objectId} review={review} />
        ))}
      </PagedList>
    </div>
  );
}

function ReviewRow({ review }: { review: Review }) {
  const { t, format } = useI18n();
  const rating = Math.max(0, Math.min(5, Math.round(review.rating ?? 0)));

  return (
    <li className="border-separator/70 flex items-start gap-3 border-b px-3 py-3 last:border-b-0 sm:px-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-warning flex items-center gap-0.5" aria-label={t('catalogue.reviews.stars', { count: rating })}>
            {Array.from({ length: 5 }, (_, index) => (
              <StarIcon
                key={index}
                aria-hidden
                className={'size-3.5 ' + (index < rating ? 'fill-current' : 'text-faint')}
              />
            ))}
          </span>
          <span className="text-body font-bold">{review.user?.fullname ?? t('catalogue.reviews.unknownUser')}</span>
          <span className="text-caption text-faint">{format.dateTime(review.createdAt)}</span>
        </div>
        {review.review ? (
          <p className="text-body whitespace-pre-line">{review.review}</p>
        ) : (
          <p className="text-caption text-faint">{t('catalogue.reviews.noText')}</p>
        )}
      </div>
      {review.picture && (
        <a href={review.picture.url} target="_blank" rel="noopener noreferrer" aria-label={t('catalogue.reviews.picture')}>
          <Thumb picture={review.picture} className="size-14 rounded-xl" />
        </a>
      )}
    </li>
  );
}
