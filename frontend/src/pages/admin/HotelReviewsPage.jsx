import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { Alert, Badge, Card, Skeleton } from '@/components/ui/surfaces.jsx';
import { Select } from '@/components/ui/form-controls.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.jsx';
import { EmptyState, PageHeader, Pagination, formatDateTime } from '@/components/shared/index.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const STATUS = {
  PENDING: ['warning', 'Pending'],
  CHANGES_REQUESTED: ['danger', 'Changes requested'],
  APPROVED: ['success', 'Approved'],
  PUBLISHED: ['success', 'Published'],
};

export function HotelReviewsPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page') || 1));
  const status = params.get('status') || 'PENDING';
  const mine = params.get('mine') === 'true';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setData(null);
    setError(null);
    adminApi.listHotelReviews({ page, limit: 20, ...(status ? { status } : {}), ...(mine ? { assignedToMe: 'true' } : {}) }).then(setData).catch((err) => setError(normalizeError(err).message));
  }, [page, status, mine]);

  const update = (key, value) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value) next.set(key, value); else next.delete(key);
    if (key !== 'page') next.delete('page');
    return next;
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Hotel reviews" description="Internal quality review queue for hotels submitted by the onboarding team." />
      <div className="flex max-w-2xl flex-col gap-3 sm:flex-row"><Select aria-label="Review status" value={status} onChange={(event) => update('status', event.target.value)}><option value="">All review statuses</option><option value="PENDING">Pending review</option><option value="CHANGES_REQUESTED">Changes requested</option><option value="APPROVED">Approved</option><option value="PUBLISHED">Published</option></Select><Select aria-label="Reviewer assignment" value={mine ? 'true' : ''} onChange={(event) => update('mine', event.target.value)}><option value="">All reviewers</option><option value="true">Assigned to me</option></Select></div>
      {error && <Alert tone="error" title="Unable to load hotel reviews">{error}</Alert>}
      {!data && !error && <Card className="space-y-3 p-5"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></Card>}
      {data && data.items.length === 0 && <Card><EmptyState icon={ClipboardCheck} title="No hotel reviews in this queue" description="Submitted hotels will appear here." /></Card>}
      {data && data.items.length > 0 && (
        <Card className="overflow-hidden">
          <Table minWidth="720px">
            <TableHeader><tr><TableHead>Hotel</TableHead><TableHead>Status</TableHead><TableHead>Submitted</TableHead><TableHead>Reviewer</TableHead><TableHead className="text-right">Action</TableHead></tr></TableHeader>
            <TableBody>{data.items.map((review) => {
              const [tone, label] = STATUS[review.status] ?? ['neutral', review.status];
              return <TableRow key={review.id}><TableCell><p className="font-medium text-[var(--text-strong)]">{review.hotelName}</p><p className="text-xs text-[var(--text-muted)]">{review.hotelCity || 'City not set'} · round {review.roundNumber}</p></TableCell><TableCell><Badge tone={tone}>{label}</Badge></TableCell><TableCell><p>{formatDateTime(review.submittedAt)}</p><p className="text-xs text-[var(--text-muted)]">by {review.submittedBy || 'staff'}</p></TableCell><TableCell>{review.assignedReviewer || 'Unassigned'}</TableCell><TableCell className="text-right"><Link className="font-medium text-brand-600 hover:underline" to={`/admin/hotels/${review.hotelId}?tab=review`}>Open review</Link></TableCell></TableRow>;
            })}</TableBody>
          </Table>
        </Card>
      )}
      {data && <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={(next) => update('page', String(next))} />}
    </div>
  );
}
