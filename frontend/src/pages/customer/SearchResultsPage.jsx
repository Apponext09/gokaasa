import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Filter, Search, SlidersHorizontal, X } from 'lucide-react';
import { Alert } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { EmptyState, Pagination } from '@/components/shared/index.jsx';
import { SearchWidget } from '@/features/search/components/SearchWidget.jsx';
import { FilterPanel } from '@/features/search/components/FilterPanel.jsx';
import { HotelCard, HotelCardSkeleton } from '@/features/search/components/HotelCard.jsx';
import {
  SORT_OPTIONS,
  parseSearchParams,
  slugifyPlace,
  summarizeOccupancy,
  toSearchParams,
  todayIso,
  validateStay,
} from '@/features/search/searchParams.js';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { discoveryApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { formatDateTime } from '@/components/shared/index.jsx';

const titleCase = (slug) => slug.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

const shortDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Builds the API request from the URL. The URL and the request use the same parameter names. */
function buildRequest(state, destination) {
  const params = toSearchParams(state);
  if (destination) params.set('destination', destination);
  if (state.area) params.set('area', state.area);
  return params;
}

export function SearchResultsPage() {
  const { destination: destinationParam } = useParams();
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const destination = slugifyPlace(destinationParam);
  const state = useMemo(() => parseSearchParams(params), [params]);
  const stayProblem = validateStay(state, today);
  const hasStay = !stayProblem;
  const label = titleCase(destination || 'your destination');

  const [data, setData] = useState(null);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [modifying, setModifying] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const { status: authStatus } = useAuth();

  const requestKey = hasStay ? buildRequest(state, destination).toString() : '';

  useEffect(() => {
    if (!hasStay) {
      setData(null);
      setStatus('idle');
      return undefined;
    }
    // Results include each hotel's wishlist state, so wait for the session check first.
    if (authStatus === 'loading') return undefined;
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    discoveryApi
      .search(Object.fromEntries(buildRequest(state, destination)), { signal: controller.signal })
      .then((result) => {
        setData(result);
        setStatus('ready');
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(normalizeError(err).message);
        setStatus('error');
      });
    return () => controller.abort();
    // requestKey captures every input that affects the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, retryKey, authStatus]);

  // Every change to filters, sort or page is written to the URL, so the page is always shareable.
  const update = (patch, { resetPage = true } = {}) => {
    const next = { ...state, ...patch, page: resetPage && !('page' in patch) ? 1 : (patch.page ?? state.page) };
    const search = toSearchParams(next);
    if (state.area) search.set('area', state.area);
    setParams(search, { replace: false });
  };

  const total = data?.pagination?.total ?? 0;
  const title = `Hotels in ${label}`;
  useDocumentMeta({
    title: `${title} | Gokaasa`,
    description: hasStay ? `Compare ${total} hotels in ${label} for ${shortDate(state.checkIn)} to ${shortDate(state.checkOut)}. Prices include taxes and fees.` : `Find hotels in ${label} on Gokaasa.`,
    canonicalPath: `/hotels/${destination}`,
  });

  const filtersPanel = (
    <FilterPanel
      filters={state.filters}
      priceBounds={data?.priceBounds}
      disabled={status === 'loading'}
      onChange={(filters) => update({ filters })}
      onClear={() => update({ filters: {} })}
    />
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
      {/* Search summary. The full search widget opens in place, so the results never leave the page. */}
      <section aria-label="Search summary" className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-sm">
        {!modifying ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-0.5">
              <p className="text-sm font-semibold text-[var(--text-strong)]">{label}</p>
              <p className="text-sm text-[var(--text-muted)]">
                {hasStay
                  ? `${shortDate(state.checkIn)} → ${shortDate(state.checkOut)} · ${summarizeOccupancy(state.occupancy)}`
                  : 'Choose dates and guests to see prices'}
              </p>
            </div>
            <Button variant="secondary" onClick={() => setModifying(true)}>
              <Search className="h-4 w-4" aria-hidden="true" /> Modify Search
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[var(--text-strong)]">Modify search</p>
              <Button variant="ghost" size="sm" onClick={() => setModifying(false)}>
                <X className="h-4 w-4" aria-hidden="true" /> Close
              </Button>
            </div>
            <SearchWidget
              variant="compact"
              initial={{ destination, area: state.area, checkIn: state.checkIn, checkOut: state.checkOut, occupancy: state.occupancy }}
              onSubmitted={() => setModifying(false)}
            />
          </div>
        )}
      </section>

      {!hasStay && status === 'idle' && (
        <div className="mt-8 rounded-2xl border border-dashed border-[var(--border-subtle)] p-8 text-center">
          <EmptyState
            title="Choose your dates"
            description={stayProblem ? `${stayProblem}.` : 'Pick check-in and check-out, and your guests, to see available rooms and prices.'}
            action={
              <Button onClick={() => setModifying(true)}>
                <Search className="h-4 w-4" aria-hidden="true" /> Choose dates
              </Button>
            }
          />
        </div>
      )}

      {hasStay && (
        <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="hidden lg:block lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:pr-2">
            {filtersPanel}
          </aside>

          <section className="min-w-0" aria-live="polite">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">{title}</h1>
                <p className="text-sm text-[var(--text-muted)]">
                  {status === 'loading' && !data ? 'Checking availability…' : `${total.toLocaleString('en-IN')} propert${total === 1 ? 'y' : 'ies'} found`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setSheetOpen(true)}>
                  <Filter className="h-4 w-4" aria-hidden="true" /> Filters
                </Button>
                <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <SlidersHorizontal className="hidden h-4 w-4 sm:block" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Sort by</span>
                  <select
                    value={state.sort}
                    onChange={(event) => update({ sort: event.target.value })}
                    className="h-9 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 text-sm text-[var(--text-strong)]"
                    aria-label="Sort hotels"
                  >
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </label>
              </div>
            </header>

            <div className="mt-4 space-y-4">
              {status === 'loading' && !data && [0, 1, 2, 3].map((i) => <HotelCardSkeleton key={i} />)}

              {status === 'error' && (
                <Alert tone="error" title="We couldn't load hotels right now.">
                  <span className="flex flex-wrap items-center gap-3">
                    {error}
                    <Button size="sm" variant="secondary" onClick={() => setRetryKey((k) => k + 1)}>Try again</Button>
                  </span>
                </Alert>
              )}

              {status === 'ready' && data?.items.length === 0 && (
                <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-8">
                  <EmptyState
                    icon={Search}
                    title="No hotels found"
                    description="Try changing your dates or destination, or clear some filters."
                    action={
                      <div className="flex flex-wrap justify-center gap-2">
                        <Button variant="secondary" onClick={() => setModifying(true)}>Modify Search</Button>
                        {Object.values(state.filters).some((v) => (Array.isArray(v) ? v.length : v)) && (
                          <Button variant="ghost" onClick={() => update({ filters: {} })}>Clear filters</Button>
                        )}
                      </div>
                    }
                  />
                </div>
              )}

              {status !== 'error' && data?.items.map((hotel) => <HotelCard key={hotel.id} hotel={hotel} state={state} />)}

              {status === 'loading' && data && <p className="text-center text-xs text-[var(--text-muted)]">Updating results…</p>}
            </div>

            {data && data.pagination.totalPages > 1 && (
              <div className="mt-8">
                <Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} onPageChange={(page) => update({ page }, { resetPage: false })} />
              </div>
            )}
            {data && (
              <p className="mt-4 text-xs text-[var(--text-muted)]">
                Prices are per room per night and include the taxes and fees shown. Last checked {formatDateTime(new Date())}.
              </p>
            )}
          </section>
        </div>
      )}

      {/* Mobile filters: a full-height sheet that applies immediately, so there is no second confirm step. */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Filters">
          <button className="absolute inset-0 bg-black/40" aria-label="Close filters" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-[var(--surface-card)] p-5 shadow-lg">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-base font-semibold">Filters</p>
              <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setSheetOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {filtersPanel}
            <div className="sticky bottom-0 -mx-5 mt-5 border-t border-[var(--border-subtle)] bg-[var(--surface-card)] px-5 py-3">
              <Button className="w-full" onClick={() => setSheetOpen(false)}>Show {total} hotels</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
