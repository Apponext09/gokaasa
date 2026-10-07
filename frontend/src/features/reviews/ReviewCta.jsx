import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button.jsx';
import { reviewApi } from '@/services/endpoints.js';
import { ReviewFormDialog } from './ReviewFormDialog.jsx';

/**
 * Write Review / Review Pending / View Review / nothing, for one completed booking. `review` is the
 * `{ id, status } | null` the booking DTO already carries, so most bookings need no extra request at all;
 * only an unreviewed booking is checked against the eligibility rule (completed, not already reviewed).
 */
export function ReviewCta({ bookingId, review, onChanged, size = 'sm' }) {
  const [eligible, setEligible] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [loadingReview, setLoadingReview] = useState(false);

  useEffect(() => {
    if (review) return undefined;
    let active = true;
    reviewApi
      .eligibility(bookingId)
      .then((result) => active && setEligible(result.eligible))
      .catch(() => active && setEligible(false));
    return () => {
      active = false;
    };
  }, [bookingId, review]);

  if (!review && eligible !== true) return null;

  const openWrite = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openExisting = async () => {
    setLoadingReview(true);
    try {
      const mine = await reviewApi.mine();
      setEditing(mine.find((r) => r.bookingId === bookingId) ?? null);
      setDialogOpen(true);
    } finally {
      setLoadingReview(false);
    }
  };

  const label = !review ? 'Write Review' : review.status === 'PENDING' ? 'Review Pending' : 'View Review';

  return (
    <>
      <Button variant="secondary" size={size} loading={loadingReview} onClick={review ? openExisting : openWrite}>
        {label}
      </Button>
      <ReviewFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        bookingId={bookingId}
        existingReview={editing}
        onSaved={(saved) => onChanged?.({ id: saved.id, status: saved.status })}
      />
    </>
  );
}
