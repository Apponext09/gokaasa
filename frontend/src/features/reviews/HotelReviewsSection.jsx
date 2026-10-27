import { useEffect, useState } from 'react';
import { BadgeCheck, MessageSquareText, Star } from 'lucide-react';
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
    <span className="flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((number) => (
        <Star
          key={number}
          className={`${size} ${number <= value ? 'fill-accent-500 text-accent-500' : 'fill-white text-slate-300'}`}
          aria-hidden="true"
        />
      ))}
    </span>
  );
}

function ratingLabel(value) {
  if (value >= 4.5) return 'Exceptional';
  if (value >= 4) return 'Very good';
  if (value >= 3) return 'Good';
  if (value >= 2) return 'Fair';
  return 'Needs improvement';
}

function reviewerInitials(name) {
  return String(name ?? 'Guest')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'G';
}

/** Approved reviews and the live rating aggregate for one hotel. */
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
    <section id="reviews" aria-labelledby="reviews-heading" className="hotel-detail-panel space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-50 text-brand-700">
            <MessageSquareText className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <h2 id="reviews-heading" className="text-base font-semibold text-[var(--text-strong)]">Guest reviews</h2>
            <p className="text-xs text-[var(--text-muted)]">Feedback from completed stays</p>
          </div>
        </div>
        {total > 0 && (
          <Select
            aria-label="Sort reviews"
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
            className="max-w-[10rem]"
          >
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        )}
      </div>

      {total === 0 ? (
        <div className="hotel-reviews-empty rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--surface-muted)]/60 px-4 py-6 text-center">
          <p className="font-medium text-[var(--text-strong)]">No guest reviews yet</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Be the first guest to share your stay experience.</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-4">
          <aside className="hotel-review-summary rounded-xl border border-brand-100 bg-brand-50/60 p-4 lg:col-span-1">
            <div className="flex items-end gap-1.5">
              <span className="font-[var(--font-display)] text-3xl font-bold leading-none text-slate-950">{rating.average.toFixed(1)}</span>
              <span className="text-xs text-[var(--text-muted)]">/ 5</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Stars value={Math.round(rating.average)} size="h-4 w-4" />
              <span className="text-xs font-semibold text-brand-700">{ratingLabel(rating.average)}</span>
            </div>
            <p className="mt-1.5 text-xs text-[var(--text-muted)]">{total.toLocaleString('en-IN')} review{total === 1 ? '' : 's'}</p>

            <div className="mt-3 space-y-1.5" aria-label="Rating distribution">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = rating.distribution?.[star] ?? 0;
                const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                return (
                  <div key={star} className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                    <span className="w-3 shrink-0 font-medium">{star}</span>
                    <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-accent-500" style={{ width: `${percentage}%` }} />
                    </div>
                    <span className="w-5 shrink-0 text-right tabular-nums">{count}</span>
                  </div>
                );
              })}
            </div>
          </aside>

          <div className="space-y-3 lg:col-span-3">
            {error && <p role="alert" className="text-sm text-danger-600">{error}</p>}
            {!data && !error && <Skeleton className="h-40 w-full rounded-xl" />}
            {data?.items.length === 0 && <p className="text-sm text-[var(--text-muted)]">No reviews on this page.</p>}
            {data?.items.map((review) => (
              <article key={review.id} className="hotel-review-card rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-700 text-xs font-bold text-white">
                      {reviewerInitials(review.reviewerName)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--text-strong)]">{review.reviewerName || 'Gokaasa guest'}</p>
                      <p className="text-[11px] text-[var(--text-muted)]">{formatDateTime(review.createdAt)}</p>
                    </div>
                  </div>
                  {review.verifiedStay && (
                    <Badge tone="success"><BadgeCheck className="h-3 w-3" aria-hidden="true" /> Verified stay</Badge>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <Stars value={review.rating} />
                  <span className="text-[11px] font-semibold text-amber-700">{Number(review.rating).toFixed(1)}</span>
                </div>
                {review.title && <h3 className="mt-2 text-sm font-semibold text-[var(--text-strong)]">{review.title}</h3>}
                <p className="mt-1 text-sm leading-5 text-[var(--text-body)]">{review.body}</p>
              </article>
            ))}
            {data && <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={setPage} />}
          </div>
        </div>
      )}
    </section>
  );
}
