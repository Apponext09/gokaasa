import { useEffect, useState } from 'react';
import { ChevronDown, ScrollText } from 'lucide-react';
import { Alert, Badge, Card, Skeleton } from '@/components/ui/surfaces.jsx';
import { EmptyState, Pagination, formatDateTime } from '@/components/shared/index.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const ENTITY_LABEL = { hotel: 'Hotel', room_type: 'Room type', rate_plan: 'Rate plan' };

function describeAction(action) {
  return action.replaceAll(/[._]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function ActivityRow({ entry }) {
  const [open, setOpen] = useState(false);
  const hasDetails = entry.oldValue || entry.newValue;
  return (
    <li className="space-y-2 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-[var(--text-strong)]">{describeAction(entry.action)}</p>
            <Badge tone="neutral">{ENTITY_LABEL[entry.entity] ?? entry.entity}</Badge>
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {entry.actor ? `${entry.actor.name} (${entry.actor.email})` : 'System'} · {formatDateTime(entry.createdAt)}
          </p>
        </div>
        {hasDetails && (
          <button type="button" onClick={() => setOpen((o) => !o)} className="flex shrink-0 items-center gap-1 text-xs text-brand-700 hover:underline" aria-expanded={open}>
            <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" /> {open ? 'Hide' : 'View'} changes
          </button>
        )}
      </div>
      {open && hasDetails && (
        <pre className="max-h-48 overflow-auto rounded-[var(--radius-control)] bg-[var(--surface-muted)] p-2 text-[11px] text-[var(--text-body)]">
          {JSON.stringify({ previousValues: entry.oldValue ?? null, updatedValues: entry.newValue ?? null }, null, 2)}
        </pre>
      )}
    </li>
  );
}

/**
 * A hotel's full activity timeline (creation, edits, status transitions, image/amenity/room/rate changes).
 * Used both inline on HotelOnboardingHistoryPage and inside a Modal from HotelListPage's row actions.
 */
export function HotelActivityHistory({ hotelId }) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    adminApi
      .hotelActivityHistory(hotelId, { page, limit: 20 })
      .then((result) => !cancelled && setData(result))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
  }, [hotelId, page]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (data === null) return <Skeleton className="h-40 w-full" />;
  if (data.items.length === 0) {
    return <EmptyState icon={ScrollText} title="No activity recorded yet" description="This hotel has had no recorded changes since it was created." />;
  }

  return (
    <div className="space-y-3">
      <Card>
        <ul className="divide-y divide-[var(--border-subtle)]">
          {data.items.map((entry) => <ActivityRow key={entry.id} entry={entry} />)}
        </ul>
      </Card>
      {data.pagination.totalPages > 1 && <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={setPage} />}
    </div>
  );
}
