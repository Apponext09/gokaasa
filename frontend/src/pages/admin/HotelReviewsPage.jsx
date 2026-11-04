import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardCheck, Search, X } from 'lucide-react';
import { Alert, Badge, Card, Skeleton } from '@/components/ui/surfaces.jsx';
import { Input, Select } from '@/components/ui/form-controls.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table.jsx';
import { EmptyState, HotelStatusBadge, PageHeader, Pagination, formatDateTime } from '@/components/shared/index.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const STATUS = {
  PENDING: ['warning', 'Pending review'],
  PENDING_REVIEW: ['warning', 'Pending review'],
  CHANGES_REQUESTED: ['danger', 'Changes requested'],
  READY_TO_PUBLISH: ['info', 'Ready to publish'],
  APPROVED: ['success', 'Approved'],
  PUBLISHED: ['success', 'Published'],
  UNPUBLISHED: ['neutral', 'Unpublished'],
  DRAFT: ['neutral', 'Draft'],
  ARCHIVED: ['neutral', 'Archived'],
};

export function HotelReviewsPage() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page') || 1));
  const status = params.get('status') ?? '';
  const search = params.get('search') ?? '';
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState(search);

  useEffect(() => {
    setSearchTerm(search);
  }, [search]);

  useEffect(() => {
    setData(null);
    setError(null);
    adminApi
      .listHotelReviews({
        page,
        limit: 20,
        ...(status ? { status } : {}),
        ...(search ? { search } : {}),
      })
      .then(setData)
      .catch((err) => setError(normalizeError(err).message));
  }, [page, status, search]);

  const update = (key, value) =>
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      if (key !== 'page') next.delete('page');
      return next;
    });

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    update('search', searchTerm.trim());
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hotel reviews"
        description="Every submitted hotel appears in this shared quality-review queue."
      />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form onSubmit={handleSearchSubmit} className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            type="search"
            placeholder="Search hotel or city..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                update('search', '');
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--text-strong)]"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </form>

        <div className="w-full sm:w-56">
          <Select
            aria-label="Review status"
            value={status}
            onChange={(event) => update('status', event.target.value)}
          >
            <option value="">All review statuses</option>
            <option value="PENDING">Pending review</option>
            <option value="CHANGES_REQUESTED">Changes requested</option>
            <option value="APPROVED">Approved</option>
            <option value="PUBLISHED">Published</option>
          </Select>
        </div>
      </div>
      {error && <Alert tone="error" title="Unable to load hotel reviews">{error}</Alert>}
      {!data && !error && <Card className="admin-records-card space-y-3 p-5"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></Card>}
      {data && data.items.length === 0 && <Card className="admin-records-card"><EmptyState icon={ClipboardCheck} title="No hotel reviews in this queue" description="Submitted hotels will appear here." /></Card>}
      {data && data.items.length > 0 && (
        <Card className="admin-records-card overflow-hidden">
          <Table minWidth="880px">
            <TableHeader>
              <tr>
                <TableHead>Hotel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Submitted by</TableHead>
                <TableHead>Approved by</TableHead>
                <TableHead>Published by</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {data.items.map((review) => {
                const currentStatus = review.hotelStatus === 'UNPUBLISHED' ? 'UNPUBLISHED' : review.status;
                return (
                  <TableRow key={review.id}>
                    <TableCell>
                      <p className="font-medium text-[var(--text-strong)]">{review.hotelName}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {review.hotelCity || 'City not set'} · round {review.roundNumber}
                      </p>
                    </TableCell>
                    <TableCell>
                      <HotelStatusBadge status={currentStatus} />
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-[var(--text-strong)]">{formatDateTime(review.submittedAt)}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium text-[var(--text-strong)]">{review.submittedBy || '—'}</p>
                    </TableCell>
                    <TableCell>
                      {review.decidedBy ? (
                        <div>
                          <p className="text-sm font-medium text-[var(--text-strong)]">{review.decidedBy}</p>
                          {review.approvedAt && (
                            <p className="text-xs text-[var(--text-muted)]">{formatDateTime(review.approvedAt)}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--text-muted)]">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {review.publishedBy ? (
                        <div>
                          <p className="text-sm font-medium text-[var(--text-strong)]">{review.publishedBy}</p>
                          {review.publishedAt && (
                            <p className="text-xs text-[var(--text-muted)]">{formatDateTime(review.publishedAt)}</p>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-[var(--text-muted)]">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link className="font-medium text-brand-600 hover:underline" to={`/admin/hotels/${review.hotelId}?tab=review`}>
                        Open review
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      {data && <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={(next) => update('page', String(next))} />}
    </div>
  );
}
