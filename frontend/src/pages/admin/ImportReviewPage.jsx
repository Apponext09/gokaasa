import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, Trash2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Alert, Badge, Card, CardContent, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { ConfirmDialog } from '@/components/ui/dialog.jsx';
import { HotelWorkspace } from '@/features/hotels/HotelWorkspace.jsx';
import { ExternalPanel } from '@/features/hotels/components/ExternalPanel.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const IN_PROGRESS = ['PENDING', 'PROCESSING'];

function ImportInProgress({ review }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-600" aria-hidden="true" />
        <div className="space-y-1">
          <p className="font-medium text-[var(--text-strong)]">Importing {review.job.searchQuery}</p>
          <p className="text-sm text-[var(--text-muted)]">Gokaasa is fetching the provider record and preparing a draft. This page updates on its own.</p>
        </div>
        <Badge tone={review.job.status === 'PROCESSING' ? 'brand' : 'neutral'}>{review.job.status === 'PROCESSING' ? 'Processing' : 'Queued'}</Badge>
      </CardContent>
    </Card>
  );
}

function ImportFailed({ review }) {
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    setRetrying(true);
    try {
      const job = await adminApi.requestImport({ provider: review.job.provider, externalId: review.job.externalHotelId, query: review.job.searchQuery });
      navigate(`/admin/hotels/onboarding/${job.id}/review`);
    } catch (error) {
      toast.error(normalizeError(error).message);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="space-y-6">
      <Alert tone="error" title="This import did not create a draft">
        {review.job.errorMessage ?? 'The provider did not return usable data.'}
      </Alert>
      <Card>
        <CardContent className="space-y-4 p-6">
          <p className="text-sm font-medium text-[var(--text-strong)]">Activity</p>
          <ol className="space-y-1 font-mono text-xs text-[var(--text-body)]">
            {review.logs.map((entry, index) => (
              <li key={index}>
                <span className={entry.level === 'ERROR' ? 'text-danger-600' : entry.level === 'WARN' ? 'text-warning-600' : 'text-brand-700'}>{entry.level}</span>{' '}
                {entry.message}
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button onClick={retry} loading={retrying}>Try the import again</Button>
            <Link to="/admin/hotels/new" className="inline-flex h-10 items-center rounded-[var(--radius-control)] border border-[var(--border-subtle)] px-4 text-sm font-medium hover:bg-[var(--surface-muted)]">
              Create the hotel manually
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Split-screen verification workspace. LEFT: exactly what the provider sent. RIGHT: the Gokaasa draft,
 * every field editable and marked Imported, Modified, Missing or Verified.
 */
export function ImportReviewPage() {
  const { importId } = useParams();
  const navigate = useNavigate();
  const [review, setReview] = useState(null);
  const [error, setError] = useState(null);
  const [discarding, setDiscarding] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer;
    const load = () =>
      adminApi
        .importReview(importId)
        .then((data) => {
          if (cancelled) return;
          setReview(data);
          if (IN_PROGRESS.includes(data.job.status)) timer = setTimeout(load, 1500);
        })
        .catch((err) => {
          if (!cancelled) setError(normalizeError(err).message);
        });
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [importId]);

  const discard = async () => {
    setDiscarding(true);
    try {
      await adminApi.discardImport(importId);
      toast.success('Import discarded. The draft has been removed.');
      navigate('/admin/hotels/onboarding', { replace: true });
    } catch (err) {
      toast.error(normalizeError(err).message);
    } finally {
      setDiscarding(false);
      setConfirmDiscard(false);
    }
  };

  const backLink = (
    <Link to="/admin/hotels/onboarding" className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-strong)]">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to hotel search
    </Link>
  );

  if (error) {
    return (
      <div className="space-y-4">
        {backLink}
        <Alert tone="error" title="Import unavailable">{error}</Alert>
      </div>
    );
  }
  if (!review) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  let content;
  if (IN_PROGRESS.includes(review.job.status)) content = <ImportInProgress review={review} />;
  else if (review.job.status === 'DISCARDED') content = <Alert tone="info" title="This import was discarded">It no longer has a draft hotel.</Alert>;
  else if (!review.hotel) content = <ImportFailed review={review} />;
  else {
    content = (
      <HotelWorkspace
        hotelId={review.hotel.id}
        sidePanel={(hotel, actions) => <ExternalPanel external={review.external} hotel={hotel} onAddImage={actions.addProviderImage} addingUrl={actions.addingUrl} />}
        extraActions={
          review.canDiscard ? (
            <Button variant="danger-outline" onClick={() => setConfirmDiscard(true)} disabled={discarding}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Discard import
            </Button>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <XCircle className="h-3.5 w-3.5" aria-hidden="true" /> Published hotels cannot be discarded
            </span>
          )
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {backLink}
        <p className="text-xs text-[var(--text-muted)]">
          Import #{review.job.id} · {review.job.provider} · {review.job.externalHotelId}
        </p>
      </div>

      {content}

      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this import?"
        description="The draft hotel and its uploaded photos are removed. The provider record can be imported again later."
        confirmLabel="Discard import"
        loading={discarding}
        onConfirm={discard}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  );
}
