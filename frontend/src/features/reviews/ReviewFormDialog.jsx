import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/dialog.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Alert } from '@/components/ui/surfaces.jsx';
import { Input, Textarea } from '@/components/ui/form-controls.jsx';
import { FormField } from '@/components/shared/index.jsx';
import { reviewApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const BODY_MAX = 4000;
const BODY_MIN = 10;
const TITLE_MAX = 150;

/**
 * One dialog for both writing a new review (bookingId) and editing the guest's own (existingReview).
 * Editing always resets the review to PENDING on the server, same as a fresh submission.
 */
export function ReviewFormDialog({ open, onClose, bookingId, existingReview, onSaved }) {
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [touched, setTouched] = useState(false);

  const isEdit = Boolean(existingReview);

  useEffect(() => {
    if (!open) return;
    setRating(existingReview?.rating ?? 5);
    setTitle(existingReview?.title ?? '');
    setBody(existingReview?.body ?? '');
    setError(null);
    setTouched(false);
  }, [open, existingReview]);

  const trimmedBody = body.trim();
  const bodyTooShort = touched && trimmedBody.length < BODY_MIN;

  const submit = async () => {
    setTouched(true);
    if (trimmedBody.length < BODY_MIN) return;
    setLoading(true);
    setError(null);
    try {
      const payload = { rating, title: title.trim() || undefined, body: trimmedBody };
      const review = isEdit ? await reviewApi.update(existingReview.id, payload) : await reviewApi.create({ bookingId, ...payload });
      toast.success(isEdit ? 'Your review has been updated.' : 'Thanks for your review! It will appear once approved.');
      onSaved?.(review);
      onClose();
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} title={isEdit ? 'Your review' : 'Write a review'} onClose={loading ? () => {} : onClose}>
      <div className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}

        <div>
          <p className="mb-1.5 text-sm font-medium text-[var(--text-strong)]">Your rating</p>
          <div role="radiogroup" aria-label="Rating out of 5" className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} star${value === 1 ? '' : 's'}`}
                className="p-0.5"
                disabled={loading}
                onMouseEnter={() => setHoverRating(value)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(value)}
              >
                <Star
                  className={`h-7 w-7 ${(hoverRating || rating) >= value ? 'fill-accent-500 text-accent-500' : 'text-[var(--border-subtle)]'}`}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </div>

        <FormField id="review-title" label="Title (optional)" hint={`${title.length}/${TITLE_MAX}`}>
          <Input
            id="review-title"
            value={title}
            maxLength={TITLE_MAX}
            placeholder="Summarise your stay"
            disabled={loading}
            onChange={(e) => setTitle(e.target.value)}
          />
        </FormField>

        <FormField
          id="review-body"
          label="Your review"
          error={bodyTooShort ? `Say a little more about your stay (at least ${BODY_MIN} characters).` : undefined}
          hint={bodyTooShort ? undefined : `${body.length}/${BODY_MAX}`}
        >
          <Textarea
            id="review-body"
            value={body}
            maxLength={BODY_MAX}
            rows={5}
            invalid={bodyTooShort}
            placeholder="What stood out about your stay?"
            disabled={loading}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => setTouched(true)}
          />
        </FormField>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} loading={loading}>
            {isEdit ? 'Save changes' : 'Submit review'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
