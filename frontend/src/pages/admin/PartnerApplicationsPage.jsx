import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { Card, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableSkeleton } from '@/components/ui/table.jsx';
import { Button } from '@/components/ui/button.jsx';
import { EmptyState, Pagination, PageHeader, formatDateTime } from '@/components/shared/index.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const STATUS_TABS = [
  { value: 'PENDING_REVIEW', label: 'Pending review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: '', label: 'All' },
];

const STATUS_TONE = { DRAFT: 'neutral', PENDING_REVIEW: 'warning', APPROVED: 'success', REJECTED: 'danger' };

export function PartnerApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.has('status') ? params.get('status') : 'PENDING_REVIEW';
  const page = Number(params.get('page')) || 1;
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (!value) next.delete(key);
      else next.set(key, String(value));
    }
    setParams(next);
  };

  useEffect(() => {
    let cancelled = false;
    setError(null);
    adminApi
      .listPartnerApplications({ page, limit: 20, ...(status && { status }) })
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
  }, [status, page]);

  return (
    <div className="space-y-6">
      <PageHeader title="Partner Applications" description="Review self-service hotel-partner registrations." />

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab.value || 'all'}
            variant={status === tab.value ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => update({ status: tab.value || null, page: null })}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="overflow-hidden">
        {data === null && !error ? (
          <TableSkeleton rows={4} />
        ) : data?.items.length === 0 ? (
          <EmptyState icon={Building2} title="No applications found" />
        ) : (
          <Table minWidth="760px">
            <caption className="sr-only">Partner applications</caption>
            <TableHeader>
              <tr>
                <TableHead>Applicant</TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Property</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {data?.items.map((application) => (
                <TableRow key={application.userId}>
                  <TableCell>
                    <Link to={`/admin/partners/${application.userId}`} className="font-medium text-[var(--text-strong)] hover:text-brand-700">
                      {application.firstName} {application.lastName}
                    </Link>
                    <p className="text-xs text-[var(--text-muted)]">{application.email}</p>
                  </TableCell>
                  <TableCell className="text-[var(--text-body)]">{application.businessName}</TableCell>
                  <TableCell>
                    <p className="text-[var(--text-body)]">{application.propertyName}</p>
                    <p className="text-xs text-[var(--text-muted)]">{application.propertyCity}</p>
                  </TableCell>
                  <TableCell><Badge tone={STATUS_TONE[application.status] ?? 'neutral'}>{application.status.replaceAll('_', ' ')}</Badge></TableCell>
                  <TableCell className="text-[var(--text-muted)]">{formatDateTime(application.submittedAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {data && <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={(p) => update({ page: p })} />}
    </div>
  );
}
