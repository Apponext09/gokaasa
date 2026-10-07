import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronUp, ExternalLink, Globe, ImageOff, Loader2, MapPin, Plus, Search, Star, TriangleAlert, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Badge, Card, CardContent, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { Input } from '@/components/ui/form-controls.jsx';
import { EmptyState, PageHeader, formatDateTime } from '@/components/shared/index.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { cn } from '@/lib/utils.js';

const FINAL_STATUSES = ['COMPLETED', 'REVIEW_REQUIRED', 'FAILED'];

const JOB_STEPS = [
  { key: 'queued', label: 'Queued' },
  { key: 'fetching', label: 'Fetching from source' },
  { key: 'draft', label: 'Draft created' },
];

function stepIndexFor(status) {
  if (status === 'PENDING') return 0;
  if (status === 'PROCESSING') return 1;
  return 2;
}

function confidenceTone(score) {
  if (score >= 80) return 'success';
  if (score >= 50) return 'warning';
  return 'neutral';
}

function ResultCard({ result, expanded, onToggle, onImport, importing }) {
  const location = [result.city, result.state, result.country].filter(Boolean).join(', ');
  const imported = result.alreadyImported;

  return (
    <Card className="transition-shadow hover:shadow-sm">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-4">
          <div className="grid h-16 w-20 shrink-0 place-items-center rounded-lg bg-[var(--surface-muted)] text-[var(--text-muted)]" aria-hidden="true">
            {result.thumbnailUrl ? <img src={result.thumbnailUrl} alt="" className="h-full w-full rounded-lg object-cover" loading="lazy" /> : <ImageOff className="h-5 w-5" />}
          </div>
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-base font-semibold text-[var(--text-strong)]">{result.name}</h3>
              <Badge tone={confidenceTone(result.matchConfidence)}>{result.matchConfidence}% match</Badge>
              {imported && <Badge tone="brand">Already imported</Badge>}
            </div>
            <p className="flex items-center gap-1.5 text-sm text-[var(--text-muted)]">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{location || 'Location unknown'}</span>
            </p>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-muted)]">
              {result.rating != null && (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-accent-500 text-accent-500" aria-hidden="true" />
                  {result.rating}
                  {result.reviewCount != null && <span>({result.reviewCount.toLocaleString('en-IN')} reviews)</span>}
                </span>
              )}
              <span>Source: {result.sourceLabel}</span>
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-end sm:self-start">
          <Button variant="secondary" size="sm" onClick={onToggle} aria-expanded={expanded}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            View data
          </Button>
          {imported ? (
            <Link
              to={`/admin/hotels/${imported.hotelId}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border border-brand-200 px-3 text-sm font-medium text-brand-700 hover:bg-brand-50"
            >
              Open draft <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : (
            <Button size="sm" onClick={onImport} loading={importing}>
              Import
            </Button>
          )}
        </div>

        {expanded && (
          <dl className="grid w-full grid-cols-1 gap-x-6 gap-y-2 border-t border-[var(--border-subtle)] pt-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[var(--text-muted)]">Address</dt>
              <dd className="text-[var(--text-body)]">{result.addressLine || '—'}</dd>
            </div>
            <div>
              <dt className="text-[var(--text-muted)]">Coordinates</dt>
              <dd className="text-[var(--text-body)]">
                {result.latitude != null ? `${result.latitude}, ${result.longitude}` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--text-muted)]">Website</dt>
              <dd className="text-[var(--text-body)]">
                {result.website ? (
                  <a href={result.website} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                    <Globe className="h-3.5 w-3.5" aria-hidden="true" /> {result.website}
                  </a>
                ) : (
                  'Not provided'
                )}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--text-muted)]">External ID</dt>
              <dd className="font-mono text-xs text-[var(--text-body)]">
                {result.provider}:{result.externalId}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}

function ImportProgress({ job, onDismiss }) {
  const step = stepIndexFor(job.status);
  const failed = job.status === 'FAILED';
  const finished = FINAL_STATUSES.includes(job.status);

  return (
    <Card aria-live="polite">
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-strong)]">Import: {job.searchQuery}</h2>
            <p className="text-sm text-[var(--text-muted)]">Job #{job.id} · started {formatDateTime(job.startedAt ?? job.createdAt)}</p>
          </div>
          {job.status === 'REVIEW_REQUIRED' && <Badge tone="warning">Needs review</Badge>}
          {job.status === 'COMPLETED' && <Badge tone="success">Ready to review</Badge>}
          {failed && <Badge tone="danger">Failed</Badge>}
        </div>

        <ol className="grid gap-3 sm:grid-cols-3">
          {JOB_STEPS.map((item, index) => {
            const done = failed ? index < step : index <= step && finished;
            const current = !finished && index === step;
            return (
              <li key={item.key} className={cn('flex items-center gap-2 rounded-lg border p-3 text-sm', current ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-[var(--border-subtle)] text-[var(--text-muted)]')}>
                {current ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : done ? (
                  <CheckCircle2 className="h-4 w-4 text-success-600" aria-hidden="true" />
                ) : (
                  <span className="h-4 w-4 rounded-full border border-[var(--border-subtle)]" aria-hidden="true" />
                )}
                {item.label}
              </li>
            );
          })}
        </ol>

        {failed && (
          <Alert tone="error" title="The import did not complete">
            {job.errorMessage} You can try again or create the hotel manually.
          </Alert>
        )}

        {job.logs?.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-[var(--text-body)]">Activity log ({job.logs.length})</summary>
            <ul className="mt-2 space-y-1 font-mono text-xs text-[var(--text-muted)]">
              {job.logs.map((entry, index) => (
                <li key={index}>
                  <span className={entry.level === 'ERROR' ? 'text-danger-600' : entry.level === 'WARN' ? 'text-warning-600' : ''}>{entry.level}</span>{' '}
                  {entry.message}
                </li>
              ))}
            </ul>
          </details>
        )}

        <div className="flex flex-wrap justify-end gap-3">
          {finished && (
            <Button variant="secondary" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
          {job.hotelId && (
            <Link
              to={`/admin/hotels/onboarding/${job.id}/review`}
              className="inline-flex h-9 items-center rounded-[var(--radius-control)] bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
            >
              Review draft
            </Link>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function HotelOnboardingPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [results, setResults] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [importingKey, setImportingKey] = useState(null);
  const [activeJob, setActiveJob] = useState(null);
  const [recentJobs, setRecentJobs] = useState(null);

  const loadRecent = useCallback(() => {
    adminApi
      .importJobs({ limit: 5 })
      .then((data) => setRecentJobs(data.items))
      .catch(() => setRecentJobs([]));
  }, []);

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  // Poll the background job until it reaches a final state. The browser never waits on the import itself.
  useEffect(() => {
    if (!activeJob || FINAL_STATUSES.includes(activeJob.status)) return undefined;
    const timer = setTimeout(() => {
      adminApi
        .importJob(activeJob.id)
        .then((job) => {
          setActiveJob(job);
          if (FINAL_STATUSES.includes(job.status)) loadRecent();
        })
        .catch(() => {});
    }, 1200);
    return () => clearTimeout(timer);
  }, [activeJob, loadRecent]);

  const handleSearch = async (event) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    setSearching(true);
    setSearchError(null);
    setResults(null);
    setExpandedId(null);
    try {
      setResults(await adminApi.importSearch(trimmed));
    } catch (error) {
      setSearchError(normalizeError(error));
    } finally {
      setSearching(false);
    }
  };

  const handleImport = async (result) => {
    const key = `${result.provider}:${result.externalId}`;
    setImportingKey(key);
    try {
      const job = await adminApi.requestImport({ provider: result.provider, externalId: result.externalId, query: query.trim() });
      setActiveJob(job);
      toast.success('Import started. Gokaasa is fetching and normalising the hotel data.');
    } catch (error) {
      const normalized = normalizeError(error);
      if (normalized.code === 'CONFLICT' && normalized.details?.hotelId) {
        toast.info('This hotel is already in Gokaasa as a draft.');
        navigate(`/admin/hotels/${normalized.details.hotelId}`);
      } else {
        toast.error(normalized.message);
      }
    } finally {
      setImportingKey(null);
    }
  };

  return (
    <div className="space-y-8">
      <PageHeader
        title="Add a hotel"
        description="Search by name and city. Gokaasa fetches public hotel details from approved sources, then you review everything before it goes live."
        actions={
          <Link
            to="/admin/hotels/new"
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 text-sm font-medium text-[var(--text-strong)] hover:bg-[var(--surface-muted)]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Create hotel manually
          </Link>
        }
      />

      <Card className="p-2 sm:p-3">
        <form onSubmit={handleSearch} role="search" className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="hotel-search" className="sr-only">
            Hotel name and city
          </label>
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
            <Input
              id="hotel-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. Taj Lands End, Mumbai"
              className="h-12 pl-10 text-base"
              maxLength={200}
              autoFocus
            />
          </div>
          <Button type="submit" size="lg" loading={searching} disabled={query.trim().length < 2}>
            Search & fetch hotel information
          </Button>
        </form>
      </Card>

      {searching && (
        <div className="space-y-3" role="status" aria-label="Searching hotels">
          <p className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Searching hotels…
          </p>
          {[0, 1, 2].map((item) => (
            <Card key={item} className="p-5">
              <div className="flex gap-4">
                <Skeleton className="h-16 w-20" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {searchError && (
        <Alert tone="error" title="Unable to search hotels">
          {searchError.message} <Link to="/admin/hotels/new" className="font-medium underline">Create the hotel manually</Link>.
        </Alert>
      )}

      {results && (
        <section aria-labelledby="results-heading" className="space-y-4">
          <div className="flex items-end justify-between gap-3">
            <h2 id="results-heading" className="text-lg font-semibold text-[var(--text-strong)]">
              Hotel discovery results
            </h2>
            <span className="text-sm text-[var(--text-muted)]">{results.results.length} found</span>
          </div>

          {results.providerErrors.length > 0 && (
            <Alert tone="warning" title="Some sources did not respond">
              <ul className="list-inside list-disc">
                {results.providerErrors.map((item) => (
                  <li key={item.provider}>
                    {item.displayName}: {item.message}
                  </li>
                ))}
              </ul>
            </Alert>
          )}

          {results.results.length === 0 ? (
            <EmptyState
              icon={TriangleAlert}
              title="No hotels matched that search"
              description="Try the hotel's full name together with its city, or create the hotel manually."
              action={
                <Link to="/admin/hotels/new" className="text-sm font-medium text-brand-600 hover:underline">
                  Create hotel manually
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {results.results.map((result) => {
                const key = `${result.provider}:${result.externalId}`;
                return (
                  <ResultCard
                    key={key}
                    result={result}
                    expanded={expandedId === key}
                    onToggle={() => setExpandedId(expandedId === key ? null : key)}
                    importing={importingKey === key}
                    onImport={() => handleImport(result)}
                  />
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeJob && <ImportProgress job={activeJob} onDismiss={() => setActiveJob(null)} />}

      <section aria-labelledby="recent-heading" className="space-y-3">
        <h2 id="recent-heading" className="text-base font-semibold text-[var(--text-strong)]">
          Recent imports
        </h2>
        {recentJobs === null ? (
          <Skeleton className="h-24 w-full" />
        ) : recentJobs.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">No imports yet. Your recent imports will appear here.</p>
        ) : (
          <Card>
            <ul className="divide-y divide-[var(--border-subtle)]">
              {recentJobs.map((job) => (
                <li key={job.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--text-strong)]">{job.searchQuery}</p>
                    <p className="text-[var(--text-muted)]">{formatDateTime(job.createdAt)} · {job.provider}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <JobStatus status={job.status} />
                    {job.status !== 'DISCARDED' && (
                      <Link to={`/admin/hotels/onboarding/${job.id}/review`} className="font-medium text-brand-600 hover:underline">
                        Review
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}

function JobStatus({ status }) {
  const map = {
    PENDING: ['neutral', 'Queued'],
    PROCESSING: ['brand', 'Processing'],
    COMPLETED: ['success', 'Completed'],
    REVIEW_REQUIRED: ['warning', 'Needs review'],
    FAILED: ['danger', 'Failed'],
  };
  const [tone, label] = map[status] ?? ['neutral', status];
  return (
    <Badge tone={tone} className="gap-1">
      {status === 'FAILED' && <XCircle className="h-3 w-3" aria-hidden="true" />}
      {label}
    </Badge>
  );
}
