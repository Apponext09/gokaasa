import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Search } from 'lucide-react';
import { Card, Skeleton, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { Input } from '@/components/ui/form-controls.jsx';
import { EmptyState, PageHeader, formatDateTime } from '@/components/shared/index.jsx';
import { HotelActivityHistory } from '@/features/hotels/components/HotelActivityHistory.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

function AttributionLine({ label, person, at }) {
  return (
    <p className="text-sm">
      <span className="text-[var(--text-muted)]">{label}: </span>
      {person ? (
        <span className="font-medium text-[var(--text-strong)]">{person.name} <span className="font-normal text-[var(--text-muted)]">({person.email})</span></span>
      ) : (
        <span className="italic text-[var(--text-muted)]">Historical Record / Attribution Unavailable</span>
      )}
      {at && <span className="text-[var(--text-muted)]"> · {formatDateTime(at)}</span>}
    </p>
  );
}

/**
 * Onboarding-focused companion to the operational All Hotels table (HotelListPage.jsx): search for a
 * hotel, then see exactly who onboarded and last edited it and its full activity timeline, without the
 * booking/room-management chrome of the main hotels table.
 */
export function HotelOnboardingHistoryPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const selectedId = params.get('hotelId') ?? '';
  const [searchText, setSearchText] = useState(q);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [selectedError, setSelectedError] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText.trim() !== q) {
        const next = new URLSearchParams(params);
        if (searchText.trim()) next.set('q', searchText.trim());
        else next.delete('q');
        setParams(next);
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  useEffect(() => {
    if (!q) {
      setResults(null);
      return undefined;
    }
    let cancelled = false;
    setError(null);
    adminApi.listHotels({ q, limit: 10, sort: 'updated_desc' }).then((result) => !cancelled && setResults(result.items)).catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
  }, [q]);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return undefined;
    }
    let cancelled = false;
    setSelectedError(null);
    adminApi.getHotel(selectedId).then((result) => !cancelled && setSelected(result)).catch((err) => !cancelled && setSelectedError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selectHotel = (hotel) => {
    const next = new URLSearchParams(params);
    next.set('hotelId', String(hotel.id));
    setParams(next);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <PageHeader title="Hotel Onboarding History" description="Search for a hotel to see who onboarded it, who last edited it, and its full activity timeline." />

      <Card className="p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
          <Input aria-label="Search hotels by name or city" placeholder="Search hotel name or city" className="pl-9" value={searchText} onChange={(e) => setSearchText(e.target.value)} />
        </div>
        {error && <Alert tone="error" className="mt-3">{error}</Alert>}
        {q && results && (
          <ul className="mt-3 divide-y divide-[var(--border-subtle)]">
            {results.length === 0 ? (
              <li className="py-3 text-sm text-[var(--text-muted)]">No hotels match "{q}".</li>
            ) : results.map((hotel) => (
              <li key={hotel.id}>
                <button
                  type="button"
                  onClick={() => selectHotel(hotel)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left hover:bg-[var(--surface-muted)] ${String(hotel.id) === selectedId ? 'bg-brand-50' : ''}`}
                >
                  <span>
                    <span className="font-medium text-[var(--text-strong)]">{hotel.name}</span>
                    <span className="ml-2 text-xs text-[var(--text-muted)]">{[hotel.city, hotel.countryCode].filter(Boolean).join(', ')}</span>
                  </span>
                  <Badge tone="neutral">{hotel.status}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {!q ? (
        <EmptyState icon={Building2} title="Search for a hotel to begin" description="Start typing a hotel name or city above." />
      ) : selectedId && (
        <>
          {selectedError && <Alert tone="error">{selectedError}</Alert>}
          {!selected && !selectedError ? (
            <Card className="space-y-2 p-5"><Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-64" /></Card>
          ) : selected && (
            <Card className="space-y-2 p-5">
              <h2 className="text-base font-semibold text-[var(--text-strong)]">{selected.name}</h2>
              <AttributionLine label="Onboarded By" person={selected.onboardedBy} at={selected.onboardedAt} />
              <AttributionLine label="Last Edited By" person={selected.lastEditedBy} at={selected.lastEditedAt} />
            </Card>
          )}
          {selected && <HotelActivityHistory hotelId={selected.id} />}
        </>
      )}
    </div>
  );
}
