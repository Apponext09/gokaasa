import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { Select } from '@/components/ui/form-controls.jsx';
import { Badge, Skeleton } from '@/components/ui/surfaces.jsx';
import { Pagination, formatDateTime } from '@/components/shared/index.jsx';
import { reviewApi } from '@/services/endpoints.js';

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'highest', label: 'Highest rated' },
  { value: 'lowest', label: 'Lowest rated' },
];

function Stars({ value, size = 'h-3.5 w-3.5' }) {
  return (
    <span className="flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${size} ${n <= value ? 'fill-accent-500 text-accent-500' : 'text-[var(--border-subtle)]'}`} />
      ))}
    </span>
  );
}

/** Approved reviews and the live rating aggregate for one hotel. `rating` comes from the hotel detail response already loaded by the page. */
export function HotelReviewsSection({ hotelRef, rating }) {
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const total = rating?.count ?? 0;

  useEffect(() => {
    if (total === 0) return undefined;
    let active = true;
    setError(null);
    reviewApi
      .hotelReviews(hotelRef, { page, limit: 5, sort })
      .then((result) => active && setData(result))
      .catch(() => active && setError('We could not load reviews right now.'));
    return () => {
      active = false;
    };
  }, [hotelRef, page, sort, total]);

  return (
    <section id="reviews" aria-labelledby="reviews-heading" className="hotel-detail-panel space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="reviews-heading" className="text-lg font-semibold text-[var(--text-strong)]">Guest reviews</h2>
        {total > 0 && (
          <Select
            aria-label="Sort reviews"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            className="max-w-[11rem]"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        )}
      </div>

      {total === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No reviews yet. Be the first to share your stay.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-[12rem_minmax(0,1fr)]">
          <div className="h-fit space-y-2.5 rounded-[var(--radius-card)] bg-[var(--surface-muted)] p-4">
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-semibold text-[var(--text-strong)]">{rating.average.toFixed(1)}</span>
              <span className="text-sm text-[var(--text-muted)]">/ 5</span>
            </div>
            <Stars value={Math.round(rating.average)} size="h-4 w-4" />
            <p className="text-sm text-[var(--text-muted)]">{total.toLocaleString('en-IN')} review{total === 1 ? '' : 's'}</p>
            <div className="space-y-1.5 pt-2">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = rating.distribution?.[star] ?? 0;
                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={star} className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span className="w-2.5 shrink-0">{star}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-muted)]">
                      <div className="h-full rounded-full bg-accent-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 shrink-0 text-right">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
            {!data && !error && (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            )}
            {data?.items.length === 0 && <p className="text-sm text-[var(--text-muted)]">No reviews on this page.</p>}
            {data?.items.map((review) => (
              <article key={review.id} className="space-y-1.5 border-b border-[var(--border-subtle)] pb-4 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars value={review.rating} />
                  {review.verifiedStay && <Badge tone="success">Verified stay</Badge>}
                </div>
                {review.title && <p className="font-medium text-[var(--text-strong)]">{review.title}</p>}
                <p className="text-sm leading-6 text-[var(--text-body)]">{review.body}</p>
                <p className="text-xs text-[var(--text-muted)]">{review.reviewerName} · {formatDateTime(review.createdAt)}</p>
              </article>
            ))}
            {data && <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={setPage} />}
          </div>
        </div>
      )}
    </section>
  );
}
