import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, Plus, Search, Star } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { Card, Skeleton, Alert } from '@/components/ui/surfaces.jsx';
import { Input, Select } from '@/components/ui/form-controls.jsx';
import { EmptyState, HOTEL_STATUS_OPTIONS, HotelStatusBadge, PROPERTY_TYPE_OPTIONS, Pagination, PageHeader, formatDateTime } from '@/components/shared/index.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

const SORT_OPTIONS = [
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'star_desc', label: 'Star rating' },
  { value: 'rating_desc', label: 'Guest rating' },
  { value: 'created_desc', label: 'Newest first' },
];

const FILTER_KEYS = ['q', 'status', 'city', 'countryCode', 'starRating', 'propertyType', 'sort', 'page'];

function useHotelFilters() {
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(FILTER_KEYS.map((key) => [key, params.get(key) ?? '']));
  const update = (changes, { resetPage = true } = {}) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value == null) next.delete(key);
      else next.set(key, String(value));
    }
    if (resetPage && !('page' in changes)) next.delete('page');
    setParams(next);
  };
  return [filters, update];
}

export function HotelListPage() {
  const [filters, updateFilters] = useHotelFilters();
  const [searchText, setSearchText] = useState(filters.q);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  // Debounce free-text search so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchText !== filters.q) updateFilters({ q: searchText.trim() });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    const params = {
      page: Number(filters.page) || 1,
      limit: 20,
      sort: filters.sort || 'updated_desc',
      ...(filters.q && { q: filters.q }),
      ...(filters.status && { status: filters.status }),
      ...(filters.city && { city: filters.city }),
      ...(filters.countryCode && { countryCode: filters.countryCode }),
      ...(filters.starRating && { starRating: filters.starRating }),
      ...(filters.propertyType && { propertyType: filters.propertyType }),
    };
    adminApi
      .listHotels(params)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(normalizeError(err).message);
      });
    return () => {
      cancelled = true;
    };
  }, [filters.q, filters.status, filters.city, filters.countryCode, filters.starRating, filters.propertyType, filters.sort, filters.page]);

  const hasFilters = FILTER_KEYS.some((key) => key !== 'sort' && key !== 'page' && filters[key]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hotels"
        description="Every hotel in Gokaasa, including drafts awaiting verification."
        actions={
          <>
            <Link
              to="/admin/hotels/onboarding"
              className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] bg-brand-600 px-4 text-sm font-medium text-white hover:bg-brand-700"
            >
              <Search className="h-4 w-4" aria-hidden="true" /> Import hotel
            </Link>
            <Link
              to="/admin/hotels/new"
              className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 text-sm font-medium text-[var(--text-strong)] hover:bg-[var(--surface-muted)]"
            >
              <Plus className="h-4 w-4" aria-hidden="true" /> New hotel
            </Link>
          </>
        }
      />

      <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden="true" />
          <Input
            aria-label="Search hotels by name or city"
            placeholder="Search name or city"
            className="pl-9"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>
        <Select aria-label="Filter by status" value={filters.status} onChange={(e) => updateFilters({ status: e.target.value })}>
          <option value="">All statuses</option>
          {HOTEL_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
        <Select aria-label="Filter by property type" value={filters.propertyType} onChange={(e) => updateFilters({ propertyType: e.target.value })}>
          <option value="">All property types</option>
          {PROPERTY_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
        <Select aria-label="Filter by star rating" value={filters.starRating} onChange={(e) => updateFilters({ starRating: e.target.value })}>
          <option value="">Any star rating</option>
          {[5, 4, 3, 2, 1].map((stars) => (
            <option key={stars} value={stars}>{stars} star</option>
          ))}
        </Select>
        <Select aria-label="Sort hotels" value={filters.sort || 'updated_desc'} onChange={(e) => updateFilters({ sort: e.target.value })}>
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6">
          <Input aria-label="Filter by city" placeholder="City" value={filters.city} onChange={(e) => updateFilters({ city: e.target.value.trim() })} className="max-w-xs" />
          <Input
            aria-label="Filter by country code"
            placeholder="Country code (IN)"
            maxLength={2}
            value={filters.countryCode}
            onChange={(e) => updateFilters({ countryCode: e.target.value.toUpperCase() })}
            className="max-w-[10rem]"
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setSearchText(''); updateFilters({ q: '', status: '', city: '', countryCode: '', starRating: '', propertyType: '' }); }}>
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      <Card className="overflow-hidden">
        {data === null && !error ? (
          <div className="space-y-3 p-5">
            {[0, 1, 2, 3].map((row) => (
              <Skeleton key={row} className="h-14 w-full" />
            ))}
          </div>
        ) : data?.items.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={hasFilters ? 'No hotels match these filters' : 'No hotels yet'}
            description={hasFilters ? 'Try changing or clearing your filters.' : 'Import your first hotel to get started.'}
            action={
              hasFilters ? (
                <Button variant="secondary" size="sm" onClick={() => updateFilters({ q: '', status: '', city: '', countryCode: '', starRating: '', propertyType: '' })}>
                  Clear filters
                </Button>
              ) : (
                <Link to="/admin/hotels/onboarding" className="text-sm font-medium text-brand-600 hover:underline">
                  Import a hotel
                </Link>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">Hotels</caption>
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-muted)]/60 text-xs uppercase tracking-wide text-[var(--text-muted)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Hotel</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Location</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Rating</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Rooms</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Last updated</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {data?.items.map((hotel) => (
                  <tr key={hotel.id} className="hover:bg-[var(--surface-muted)]/50">
                    <td className="px-4 py-3">
                      <Link to={`/admin/hotels/${hotel.id}`} className="font-medium text-[var(--text-strong)] hover:text-brand-700">
                        {hotel.name}
                      </Link>
                      <p className="text-xs text-[var(--text-muted)]">{hotel.propertyType.replaceAll('_', ' ').toLowerCase()}</p>
                    </td>
                    <td className="px-4 py-3 text-[var(--text-body)]">{[hotel.city, hotel.countryCode].filter(Boolean).join(', ')}</td>
                    <td className="px-4 py-3">
                      {hotel.starRating ? (
                        <span className="inline-flex items-center gap-1 text-[var(--text-body)]">
                          <Star className="h-3.5 w-3.5 fill-accent-500 text-accent-500" aria-hidden="true" />
                          {hotel.starRating}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[var(--text-body)]">{hotel.roomTypeCount}</td>
                    <td className="px-4 py-3"><HotelStatusBadge status={hotel.status} /></td>
                    <td className="px-4 py-3 text-[var(--text-muted)]">{formatDateTime(hotel.updatedAt)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link to={`/admin/hotels/${hotel.id}`} className="font-medium text-brand-600 hover:underline">
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {data && (
        <Pagination
          page={data.pagination.page}
          totalPages={data.pagination.totalPages}
          onPageChange={(page) => updateFilters({ page }, { resetPage: false })}
        />
      )}
    </div>
  );
}
