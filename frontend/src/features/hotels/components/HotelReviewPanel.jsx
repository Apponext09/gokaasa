import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, CircleAlert, MessageSquarePlus, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Label, Select, Textarea } from '@/components/ui/form-controls.jsx';
import { EmptyState, formatDateTime } from '@/components/shared/index.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const SECTIONS = ['OVERVIEW', 'LOCATION', 'IMAGES', 'AMENITIES', 'ROOMS', 'POLICIES', 'OTHER'];
const REVIEW_STATUS = {
  PENDING: ['warning', 'Pending review'],
  CHANGES_REQUESTED: ['danger', 'Changes requested'],
  APPROVED: ['success', 'Approved'],
  PUBLISHED: ['success', 'Published'],
};
const ISSUE_STATUS = {
  OPEN: ['danger', 'Open'],
  FIXED_BY_ONBOARDING: ['warning', 'Marked fixed'],
  VERIFIED: ['success', 'Verified'],
  REOPENED: ['danger', 'Reopened'],
};

export function HotelReviewPanel({ hotelId, onStatusChanged }) {
  const { user, isAdmin, isReviewExecutive } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [reviewerId, setReviewerId] = useState('');
  const [issue, setIssue] = useState({ section: 'OVERVIEW', severity: 'REQUIRED', comment: '' });
  const [summary, setSummary] = useState('');

  const load = useCallback(() => {
    setError(null);
    return adminApi.hotelReview(hotelId).then(setData).catch((err) => setError(normalizeError(err).message));
  }, [hotelId]);

  useEffect(() => { load(); }, [load]);

  const mutate = async (key, action, { refreshHotel = false } = {}) => {
    setBusy(key);
    try {
      const next = await action();
      setData((current) => ({ ...current, review: next }));
      if (refreshHotel) await onStatusChanged?.();
      toast.success('Internal review updated');
      return true;
    } catch (err) {
      toast.error(normalizeError(err).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (error) return <Alert tone="error" title="Review unavailable">{error}</Alert>;
  if (!data) return <Skeleton className="h-64 w-full" />;
  if (!data.review) {
    return (
      <Card>
        <EmptyState icon={CircleAlert} title="Not submitted for internal review" description="Complete the hotel and use Submit for review. Its review history will then appear here beside Import history." />
      </Card>
    );
  }

  const { review, reviewers } = data;
  const [statusTone, statusLabel] = REVIEW_STATUS[review.status] ?? ['neutral', review.status];
  const canReview = isAdmin || isReviewExecutive;
  const requiredOpen = review.issues.some((item) => item.severity === 'REQUIRED' && item.status !== 'VERIFIED');

  const addIssue = async (event) => {
    event.preventDefault();
    if (issue.comment.trim().length < 3) return;
    const ok = await mutate('add-issue', () => adminApi.addHotelReviewIssue(hotelId, { ...issue, comment: issue.comment.trim() }));
    if (ok) setIssue((current) => ({ ...current, comment: '' }));
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Internal hotel review</CardTitle>
              <CardDescription>Round {review.roundNumber}, submitted by {review.submittedBy || 'staff'} on {formatDateTime(review.submittedAt)}.</CardDescription>
            </div>
            <Badge tone={statusTone}>{statusLabel}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-[var(--text-muted)]">Assigned reviewer</dt><dd className="font-medium">{review.assignedReviewer || 'Unassigned'}</dd></div>
            <div><dt className="text-[var(--text-muted)]">Submission count</dt><dd className="font-medium">{review.submissionCount}</dd></div>
            <div><dt className="text-[var(--text-muted)]">Decision</dt><dd className="font-medium">{review.decidedBy || 'Waiting'}</dd></div>
          </dl>
          {review.decisionSummary && <Alert tone={review.status === 'CHANGES_REQUESTED' ? 'warning' : 'success'} title="Reviewer summary">{review.decisionSummary}</Alert>}
          {isAdmin && ['PENDING', 'CHANGES_REQUESTED'].includes(review.status) && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="flex-1"><Label htmlFor="reviewer">Assign reviewer</Label><Select id="reviewer" value={reviewerId} onChange={(event) => setReviewerId(event.target.value)}><option value="">Choose Hotel Review Executive</option>{reviewers.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName} ({item.email})</option>)}</Select></div>
              <Button variant="secondary" disabled={!reviewerId} loading={busy === 'assign'} onClick={() => mutate('assign', () => adminApi.assignHotelReviewer(hotelId, Number(reviewerId)))}>Assign</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {canReview && review.status === 'PENDING' && (
        <Card>
          <CardHeader><CardTitle>Add review comment</CardTitle><CardDescription>Required issues must be fixed and verified before approval.</CardDescription></CardHeader>
          <CardContent>
            <form onSubmit={addIssue} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label htmlFor="issue-section">Section</Label><Select id="issue-section" value={issue.section} onChange={(event) => setIssue((current) => ({ ...current, section: event.target.value }))}>{SECTIONS.map((item) => <option key={item} value={item}>{item.toLowerCase().replaceAll('_', ' ')}</option>)}</Select></div>
                <div><Label htmlFor="issue-severity">Importance</Label><Select id="issue-severity" value={issue.severity} onChange={(event) => setIssue((current) => ({ ...current, severity: event.target.value }))}><option value="REQUIRED">Required fix</option><option value="SUGGESTION">Suggestion</option></Select></div>
              </div>
              <div><Label htmlFor="issue-comment">Comment for onboarding executive</Label><Textarea id="issue-comment" maxLength={2000} value={issue.comment} onChange={(event) => setIssue((current) => ({ ...current, comment: event.target.value }))} placeholder="Explain what needs to change and where." /></div>
              <Button type="submit" loading={busy === 'add-issue'} disabled={issue.comment.trim().length < 3}><MessageSquarePlus className="h-4 w-4" /> Add comment</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Issues and comments</CardTitle><CardDescription>The onboarding executive marks a correction fixed; the reviewer verifies it.</CardDescription></CardHeader>
        <CardContent>
          {review.issues.length === 0 ? <p className="text-sm text-[var(--text-muted)]">No issues have been recorded.</p> : (
            <ul className="space-y-3">
              {review.issues.map((item) => {
                const [tone, label] = ISSUE_STATUS[item.status] ?? ['neutral', item.status];
                return (
                  <li key={item.id} className="rounded-lg border border-[var(--border-subtle)] p-4">
                    <div className="flex flex-wrap items-center gap-2"><Badge tone={item.severity === 'REQUIRED' ? 'danger' : 'neutral'}>{item.severity === 'REQUIRED' ? 'Required' : 'Suggestion'}</Badge><Badge tone={tone}>{label}</Badge><span className="text-xs uppercase text-[var(--text-muted)]">{item.section}</span></div>
                    <p className="mt-2 text-sm text-[var(--text-body)]">{item.comment}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">Added by {item.createdBy || 'staff'} · {formatDateTime(item.createdAt)}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {review.status === 'CHANGES_REQUESTED' && (isAdmin || review.submittedById === user?.id) && ['OPEN', 'REOPENED'].includes(item.status) && <Button size="sm" variant="secondary" loading={busy === `fix-${item.id}`} onClick={() => mutate(`fix-${item.id}`, () => adminApi.fixHotelReviewIssue(hotelId, item.id))}><CheckCircle2 className="h-4 w-4" /> Mark fixed</Button>}
                      {review.status === 'PENDING' && canReview && item.status === 'FIXED_BY_ONBOARDING' && <Button size="sm" loading={busy === `verify-${item.id}`} onClick={() => mutate(`verify-${item.id}`, () => adminApi.verifyHotelReviewIssue(hotelId, item.id))}><CheckCircle2 className="h-4 w-4" /> Verify fix</Button>}
                      {review.status === 'PENDING' && canReview && ['FIXED_BY_ONBOARDING', 'VERIFIED'].includes(item.status) && <Button size="sm" variant="secondary" loading={busy === `reopen-${item.id}`} onClick={() => mutate(`reopen-${item.id}`, () => adminApi.reopenHotelReviewIssue(hotelId, item.id))}><RotateCcw className="h-4 w-4" /> Reopen</Button>}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {canReview && review.status === 'PENDING' && (
        <Card>
          <CardHeader><CardTitle>Review decision</CardTitle><CardDescription>Request corrections or approve once all required issues are verified.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <div><Label htmlFor="decision-summary">Summary</Label><Textarea id="decision-summary" maxLength={2000} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Optional overall feedback." /></div>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger-outline" disabled={!requiredOpen} loading={busy === 'changes'} onClick={() => mutate('changes', () => adminApi.requestHotelChanges(hotelId, summary.trim() || null), { refreshHotel: true })}>Request changes</Button>
              <Button disabled={requiredOpen} loading={busy === 'approve'} onClick={() => mutate('approve', () => adminApi.approveHotelReview(hotelId, summary.trim() || null), { refreshHotel: true })}><CheckCircle2 className="h-4 w-4" /> Approve hotel</Button>
              {isAdmin && <Button variant="secondary" disabled={requiredOpen} loading={busy === 'publish'} onClick={() => mutate('publish', () => adminApi.approveAndPublishHotel(hotelId, summary.trim() || null), { refreshHotel: true })}>Approve & publish</Button>}
            </div>
          </CardContent>
        </Card>
      )}

      {review.events.length > 0 && (
        <Card><CardHeader><CardTitle>Review history</CardTitle></CardHeader><CardContent><ol className="space-y-2">{review.events.map((event) => <li key={event.id} className="border-l-2 border-brand-200 pl-3 text-sm"><p className="font-medium text-[var(--text-strong)]">{event.type.toLowerCase().replaceAll('_', ' ')}</p><p className="text-xs text-[var(--text-muted)]">{event.actor || 'System'} · {formatDateTime(event.createdAt)}{event.message ? ` · ${event.message}` : ''}</p></li>)}</ol></CardContent></Card>
      )}
    </div>
  );
}
