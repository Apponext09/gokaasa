import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquareText, Search, Star } from 'lucide-react';
import { toast } from 'sonner';
import { Card, Skeleton, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { Input, Select, Textarea } from '@/components/ui/form-controls.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Modal } from '@/components/ui/dialog.jsx';
import { EmptyState, Pagination, PageHeader, formatDateTime } from '@/components/shared/index.jsx';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const STATUS_TONE = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'danger', HIDDEN: 'neutral' };

/** Only the transitions the backend's review state machine actually allows, phrased the way a moderator reads them. */
const ACTIONS_FOR_STATUS = {
  PENDING: [{ action: 'APPROVE', label: 'Approve' }, { action: 'REJECT', label: 'Reject', needsReason: true }],
  APPROVED: [{ action: 'HIDE', label: 'Hide', needsReason: true }, { action: 'REJECT', label: 'Reject', needsReason: true }],
  REJECTED: [{ action: 'APPROVE', label: 'Approve' }],
  HIDDEN: [{ action: 'RESTORE', label: 'Restore' }],
};

const FILTER_KEYS = ['q', 'status', 'hotelId', 'page'];

function useFilters() {
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) ?? '']));
  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (!value) next.delete(key);
      else next.set(key, String(value));
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };
  return [filters, update];
}

function Stars({ value }) {
  return (
    <span className="flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`h-3.5 w-3.5 ${n <= value ? 'fill-accent-500 text-accent-500' : 'text-[var(--border-subtle)]'}`} aria-hidden="true" />
      ))}
    </span>
  );
}

/** Reviews moderation. ADMIN sees every hotel; a HOTEL_MANAGER is scoped server-side to their own and cannot moderate. */
export function ReviewsPage() {
  const { isAdmin } = useAuth();
  const [filters, updateFilters] = useFilters();
  const [searchText, setSearchText] = useState(filters.q);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [pending, setPending] = useState(null); // { review, action, label, needsReason }
  const [reason, setReason] = useState('');
  const [acting, setActing] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText !== filters.q) updateFilters({ q: searchText.trim() });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    adminApi
      .listReviews({
        page: Number(filters.page) || 1,
        limit: 20,
        ...(filters.q && { q: filters.q }),
        ...(filters.status && { status: filters.status }),
        ...(filters.hotelId && { hotelId: filters.hotelId }),
      })
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
  }, [filters.q, filters.status, filters.hotelId, filters.page, reloadKey]);

  const hasFilters = Boolean(filters.q || filters.status || filters.hotelId);

  const startAction = (review, step) => {
    setReason('');
    setPending({ review, ...step });
  };

  const confirmAction = async () => {
    setActing(true);
    try {
      await adminApi.moderateReview(pending.review.id, pending.action, reason.trim() || undefined);
      toast.success(`Review ${pending.label.toLowerCase()}d.`);
      setPending(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      toast.error(normalizeError(err).message);
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reviews"
        description={isAdmin ? 'Moderate guest reviews across every hotel.' : 'Guest reviews for your assigned hotels. Moderation is handled by an administrator.'}
      />

      <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-4">
        <div className="relative sm:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
          <Input aria-label="Search by title, text or guest" placeholder="Title, review text or guest" className="pl-9" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>
        <Select aria-label="Filter by status" value={filters.status} onChange={(e) => updateFilters({ status: e.target.value })}>
          <option value="">All statuses</option>
          {Object.keys(STATUS_TONE).map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </Select>
        <Input aria-label="Filter by hotel id" placeholder="Hotel ID" inputMode="numeric" value={filters.hotelId} onChange={(e) => updateFilters({ hotelId: e.target.value.replace(/\D/g, '') })} />
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="overflow-hidden">
        {data === null && !error ? (
          <div className="space-y-3 p-5">{[0, 1, 2, 3].map((row) => <Skeleton key={row} className="h-14 w-full" />)}</div>
        ) : data?.items.length === 0 ? (
          <EmptyState icon={MessageSquareText} title={hasFilters ? 'No reviews match these filters' : 'No reviews yet'} description={hasFilters ? 'Try changing or clearing your filters.' : 'Guest reviews will appear here once a stay is reviewed.'} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <caption className="sr-only">Reviews</caption>
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]/60 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Hotel</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Guest</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Rating</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Review</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Created</th>
                  {isAdmin && <th scope="col" className="px-4 py-3 font-semibold">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {data?.items.map((review) => (
                  <tr key={review.id} className="align-top hover:bg-[var(--surface-muted)]/50">
                    <td className="px-4 py-3 text-[var(--text-body)]">{review.hotelName}</td>
                    <td className="px-4 py-3 text-[var(--text-body)]">
                      <p>{review.reviewer.name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{review.reviewer.email}</p>
                    </td>
                    <td className="px-4 py-3"><Stars value={review.rating} /></td>
                    <td className="px-4 py-3 max-w-xs text-[var(--text-body)]">
                      {review.title && <p className="font-medium text-[var(--text-strong)]">{review.title}</p>}
                      <p className="line-clamp-2 text-xs text-[var(--text-muted)]">{review.body}</p>
                      {review.moderationReason && <p className="mt-1 text-xs italic text-[var(--text-muted)]">Reason: {review.moderationReason}</p>}
                    </td>
                    <td className="px-4 py-3"><Badge tone={STATUS_TONE[review.status] ?? 'neutral'}>{review.status}</Badge></td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{formatDateTime(review.createdAt)}</td>
                    {isAdmin && (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {(ACTIONS_FOR_STATUS[review.status] ?? []).map((step) => (
                            <Button key={step.action} variant="secondary" size="sm" onClick={() => startAction(review, step)}>
                              {step.label}
                            </Button>
                          ))}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data && <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={(page) => updateFilters({ page })} />}

      <Modal open={pending !== null} title={pending ? `${pending.label} this review?` : ''} onClose={acting ? () => {} : () => setPending(null)}>
        {pending && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--text-body)]">
              {pending.review.title ? `“${pending.review.title}”` : 'This review'} by {pending.review.reviewer.name} for {pending.review.hotelName}.
            </p>
            {pending.needsReason && (
              <Textarea
                aria-label="Reason (optional)"
                placeholder="Reason (optional, shown only to staff)"
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={acting}
              />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setPending(null)} disabled={acting}>Cancel</Button>
              <Button onClick={confirmAction} loading={acting}>{pending.label}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
