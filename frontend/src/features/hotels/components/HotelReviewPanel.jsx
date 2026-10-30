import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Label, Textarea } from '@/components/ui/form-controls.jsx';
import { EmptyState, formatDateTime } from '@/components/shared/index.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const REVIEW_STATUS = {
  PENDING: ['warning', 'Pending review'],
  CHANGES_REQUESTED: ['danger', 'Changes requested'],
  APPROVED: ['success', 'Ready to publish'],
  PUBLISHED: ['success', 'Published'],
};

/** One shared review, one consolidated comment, and two decisions: request changes or approve. */
export function HotelReviewPanel({ hotelId, publishBlockers = [], onStatusChanged }) {
  const { isAdmin, isReviewExecutive } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [comment, setComment] = useState('');

  const load = useCallback(() => {
    setError(null);
    return adminApi.hotelReview(hotelId).then(setData).catch((err) => setError(normalizeError(err).message));
  }, [hotelId]);

  useEffect(() => { load(); }, [load]);

  const decide = async (key, action) => {
    setBusy(key);
    try {
      const next = await action();
      setData((current) => ({ ...current, review: next }));
      setComment('');
      await onStatusChanged?.();
      toast.success(key === 'changes' ? 'Changes sent to onboarding' : 'Hotel is ready to publish');
    } catch (err) {
      const normalized = normalizeError(err);
      toast.error(normalized.message, {
        description: normalized.details?.map((detail) => detail.message).join(' · '),
      });
    } finally {
      setBusy(null);
    }
  };

  if (error) return <Alert tone="error" title="Review unavailable">{error}</Alert>;
  if (!data) return <Skeleton className="h-64 w-full" />;
  if (!data.review) {
    return (
      <Card>
        <EmptyState icon={CircleAlert} title="Not submitted for review" description="Complete the hotel and select Submit for review." />
      </Card>
    );
  }

  const { review } = data;
  const [statusTone, statusLabel] = REVIEW_STATUS[review.status] ?? ['neutral', review.status];
  const canReview = isAdmin || isReviewExecutive;
  const trimmedComment = comment.trim();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Hotel review</CardTitle>
              <CardDescription>Submission {review.submissionCount}, sent by {review.submittedBy || 'staff'} on {formatDateTime(review.submittedAt)}.</CardDescription>
            </div>
            <Badge tone={statusTone}>{statusLabel}</Badge>
          </div>
        </CardHeader>
        {review.decisionSummary && (
          <CardContent>
            <Alert tone={review.status === 'CHANGES_REQUESTED' ? 'warning' : 'success'} title={review.status === 'CHANGES_REQUESTED' ? 'Changes requested' : 'Review comment'}>
              <span className="whitespace-pre-wrap">{review.decisionSummary}</span>
            </Alert>
          </CardContent>
        )}
      </Card>

      {review.status === 'CHANGES_REQUESTED' && (
        <Alert tone="info" title="Update and resubmit">
          Admin or onboarding can make the requested changes. Select Submit for review when the hotel is ready to be checked again.
        </Alert>
      )}

      {canReview && review.status === 'PENDING' && (
        <Card>
          <CardHeader>
            <CardTitle>Review decision</CardTitle>
            <CardDescription>Write all requested changes in one comment, or approve the hotel when everything is ready.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {publishBlockers.length > 0 && (
              <Alert tone="warning" title="Complete before approval">
                {publishBlockers.join(' · ')}
              </Alert>
            )}
            <div>
              <Label htmlFor="review-comment">Comment</Label>
              <Textarea
                id="review-comment"
                maxLength={2000}
                rows={7}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={'List all changes here. Example:\n1. Add map location\n2. Replace the room photo\n3. Check the rate plan price'}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger-outline"
                disabled={trimmedComment.length < 3 || busy !== null}
                loading={busy === 'changes'}
                onClick={() => decide('changes', () => adminApi.requestHotelChanges(hotelId, trimmedComment))}
              >
                Request changes
              </Button>
              <Button
                disabled={publishBlockers.length > 0 || busy !== null}
                loading={busy === 'approve'}
                onClick={() => decide('approve', () => adminApi.approveHotelReview(hotelId, trimmedComment || null))}
              >
                <CheckCircle2 className="h-4 w-4" /> Approve review
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {review.events.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Review history</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {review.events.map((event) => (
                <li key={event.id} className="border-l-2 border-brand-200 pl-3 text-sm">
                  <p className="font-medium text-[var(--text-strong)]">{event.type.toLowerCase().replaceAll('_', ' ')}</p>
                  <p className="text-xs text-[var(--text-muted)]">{event.actor || 'System'} · {formatDateTime(event.createdAt)}{event.message ? ` · ${event.message}` : ''}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
