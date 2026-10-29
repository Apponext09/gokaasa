import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, CircleAlert } from 'lucide-react';
import { Alert, Badge, Card, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { EmptyState, formatDateTime } from '@/components/shared/index.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const STATUS = {
  PENDING: ['neutral', 'Queued'],
  PROCESSING: ['brand', 'Processing'],
  COMPLETED: ['success', 'Completed'],
  REVIEW_REQUIRED: ['warning', 'Needs review'],
  FAILED: ['danger', 'Failed'],
  DISCARDED: ['neutral', 'Discarded'],
};

export function formatDuration(ms) {
  if (ms == null) return 'Not finished';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function HistoryRow({ job, hotelId, readOnly }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  const [tone, label] = STATUS[job.status] ?? ['neutral', job.status];

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && !detail) {
      try {
        setDetail(await adminApi.importJob(job.id));
      } catch (err) {
        setError(normalizeError(err).message);
      }
    }
  };

  return (
    <li className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-[var(--text-strong)]">{job.searchQuery}</p>
            <Badge tone={tone}>{label}</Badge>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {job.provider} · external ID <span className="font-mono">{job.externalHotelId}</span> · {formatDateTime(job.createdAt)}
            {job.createdByName ? ` · by ${job.createdByName}` : ''}
          </p>
          <p className="text-xs text-[var(--text-muted)]">Processing time: {formatDuration(job.durationMs)}</p>
        </div>
        <div className="flex items-center gap-2">
          {!readOnly && job.hotelId === hotelId && job.status !== 'DISCARDED' && (
            <Link to={`/admin/hotels/onboarding/${job.id}/review`} className="text-sm font-medium text-brand-600 hover:underline">
              Open review
            </Link>
          )}
          <Button variant="ghost" size="sm" onClick={toggle} aria-expanded={open}>
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} Details
          </Button>
        </div>
      </div>

      {job.status === 'FAILED' && job.errorMessage && (
        <Alert tone="error" title="Why this import failed">
          {job.errorMessage}
        </Alert>
      )}

      {open && (
        <div className="rounded-lg bg-[var(--surface-muted)] p-3 text-xs">
          {error && <p className="text-danger-600">{error}</p>}
          {!detail && !error && <Skeleton className="h-16 w-full" />}
          {detail && (
            <ol className="space-y-1 font-mono text-[var(--text-body)]">
              {detail.logs.length === 0 && <li>No activity recorded.</li>}
              {detail.logs.map((entry, index) => (
                <li key={index}>
                  <span className={entry.level === 'ERROR' ? 'text-danger-600' : entry.level === 'WARN' ? 'text-warning-600' : 'text-brand-700'}>
                    {entry.level}
                  </span>{' '}
                  {entry.message}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </li>
  );
}

export function ImportHistory({ hotelId, readOnly = false }) {
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .importHistory(hotelId)
      .then((items) => {
        if (!cancelled) setJobs(items);
      })
      .catch((err) => {
        if (!cancelled) setError(normalizeError(err).message);
      });
    return () => {
      cancelled = true;
    };
  }, [hotelId]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (jobs === null) return <Skeleton className="h-32 w-full" />;
  if (jobs.length === 0) {
    return <EmptyState icon={CircleAlert} title="No imports for this hotel" description="Hotels created by hand have no import history." />;
  }

  return (
    <Card>
      <ul className="divide-y divide-[var(--border-subtle)]">
        {jobs.map((job) => (
          <HistoryRow key={job.id} job={job} hotelId={hotelId} readOnly={readOnly} />
        ))}
      </ul>
    </Card>
  );
}
