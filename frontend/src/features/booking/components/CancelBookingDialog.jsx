import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Alert } from '@/components/ui/surfaces.jsx';
import { bookingApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { formatMoneyMinor } from '../bookingFormat.js';
import { toast } from 'sonner';

const REASON_TEXT = {
  AFTER_DEADLINE: 'The cancellation deadline has passed, so no refund is due.',
  NON_REFUNDABLE: 'This rate is non-refundable.',
  NO_DEADLINE_CONFIGURED: 'This rate does not refund cancellations.',
  AFTER_CHECK_IN: 'The stay has already started, so it cannot be cancelled online.',
};

/**
 * Shows exactly what cancelling will refund, using the policy this booking was made under, before the guest
 * confirms. The refund itself is calculated again on the server when the cancellation is submitted.
 */
export function CancelBookingDialog({ bookingId, open, onClose, onCancelled }) {
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreview(null);
    bookingApi
      .cancellationPreview(bookingId)
      .then((result) => !cancelled && setPreview(result))
      .catch((err) => !cancelled && setError(normalizeError(err).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, bookingId]);

  const confirm = async () => {
    setLoading(true);
    try {
      const booking = await bookingApi.cancel(bookingId, { reason: 'GUEST_REQUEST' });
      toast.success('Your booking has been cancelled.');
      onCancelled?.(booking);
      onClose();
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} title="Cancel this booking?" onClose={loading ? () => {} : onClose}>
      <div className="space-y-4">
        {loading && !preview && <p className="text-sm text-[var(--text-muted)]">Checking the refund…</p>}
        {error && <Alert tone="error" title="We could not cancel this booking">{error}</Alert>}
        {preview && (
          <>
            <p className="text-sm text-[var(--text-body)]">
              {preview.canCancel && preview.refundMinor > 0
                ? `You will be refunded ${formatMoneyMinor(preview.refundMinor, preview.currency)} (${preview.refundPercent}%). The rest is kept as the cancellation charge.`
                : REASON_TEXT[preview.reason] ?? 'No refund is due for this cancellation.'}
            </p>
            {preview.canCancel && preview.nonRefundableMinor > 0 && (
              <p className="text-sm text-[var(--text-muted)]">
                Non-refundable: {formatMoneyMinor(preview.nonRefundableMinor, preview.currency)}
              </p>
            )}
            <p className="text-xs text-[var(--text-muted)]">Cancelling releases the rooms immediately. Refunds go back to your original payment method.</p>
          </>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Keep booking
          </Button>
          <Button variant="danger" onClick={confirm} loading={loading} disabled={!preview || !preview.canCancel}>
            Cancel booking
          </Button>
        </div>
      </div>
    </Modal>
  );
}
