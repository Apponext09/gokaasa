import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Building2, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui/dialog.jsx';

import { Button, buttonVariants } from '@/components/ui/button.jsx';
import { Card, Alert } from '@/components/ui/surfaces.jsx';
import { Input, Select } from '@/components/ui/form-controls.jsx';

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableSkeleton,
} from '@/components/ui/table.jsx';

import {
  EmptyState,
  HOTEL_STATUS_OPTIONS,
  HotelStatusBadge,
  Pagination,
  PageHeader,
  formatDateTime,
} from '@/components/shared/index.jsx';

import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';
import { useCatalog } from '@/features/catalogs/useCatalog.js';
import { toOptions } from '@/features/catalogs/catalogs.js';
import { useAuth } from '@/features/auth/AuthContext.jsx';

const SORT_OPTIONS = [
  { value: 'updated_desc', label: 'Recently updated' },
  { value: 'name_asc', label: 'Name A–Z' },
  { value: 'star_desc', label: 'Star rating' },
  { value: 'rating_desc', label: 'Guest rating' },
  { value: 'created_desc', label: 'Newest first' },
];

const FILTER_KEYS = [
  'q',
  'status',
  'city',
  'countryCode',
  'starRating',
  'propertyType',
  'sort',
  'page',
];

// Maximum 10 hotels per page
const PAGE_SIZE = 10;

function useHotelFilters() {
  const [params, setParams] = useSearchParams();

  const filters = Object.fromEntries(
    FILTER_KEYS.map((key) => [key, params.get(key) ?? '']),
  );

  const update = (changes, { resetPage = true } = {}) => {
    const next = new URLSearchParams(params);

    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || value == null) {
        next.delete(key);
      } else {
        next.set(key, String(value));
      }
    }

    if (resetPage && !('page' in changes)) {
      next.delete('page');
    }

    setParams(next);
  };

  return [filters, update];
}

export function HotelListPage() {
  const { isAdmin } = useAuth();
  const [filters, updateFilters] = useHotelFilters();

  const [searchText, setSearchText] = useState(filters.q);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [hotelToDelete, setHotelToDelete] = useState(null);
  const [deletingHotel, setDeletingHotel] = useState(false);

  const confirmDeleteHotel = async () => {
    if (!hotelToDelete) return;
    setDeletingHotel(true);
    try {
      await adminApi.deleteHotel(hotelToDelete.id);
      toast.success(`${hotelToDelete.name} deleted successfully`);
      setHotelToDelete(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(normalizeError(err).message);
    } finally {
      setDeletingHotel(false);
    }
  };

  const { items: propertyTypeItems } = useCatalog('property-types');
  const propertyTypeOptions = toOptions(propertyTypeItems);

  // Keep search input synchronized with URL filters.
  useEffect(() => {
    setSearchText(filters.q);
  }, [filters.q]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmedSearch = searchText.trim();

      if (trimmedSearch !== filters.q) {
        updateFilters({ q: trimmedSearch });
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchText]);

  // Fetch hotels according to pagination and filters.
  useEffect(() => {
    let cancelled = false;

    setError(null);
    setData(null);

    const params = {
      page: Number(filters.page) || 1,
      limit: PAGE_SIZE,
      sort: filters.sort || 'updated_desc',
      ...(filters.q && { q: filters.q }),
      ...(filters.status && { status: filters.status }),
      ...(filters.city && { city: filters.city }),
      ...(filters.countryCode && {
        countryCode: filters.countryCode,
      }),
      ...(filters.starRating && {
        starRating: filters.starRating,
      }),
      ...(filters.propertyType && {
        propertyType: filters.propertyType,
      }),
    };

    adminApi
      .listHotels(params)
      .then((result) => {
        if (!cancelled) {
          setData(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(normalizeError(err).message);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    filters.q,
    filters.status,
    filters.city,
    filters.countryCode,
    filters.starRating,
    filters.propertyType,
    filters.sort,
    filters.page,
    refreshKey,
  ]);

  const hasFilters = FILTER_KEYS.some(
    (key) => key !== 'sort' && key !== 'page' && filters[key],
  );

  const clearFilters = () => {
    setSearchText('');

    updateFilters({
      q: '',
      status: '',
      city: '',
      countryCode: '',
      starRating: '',
      propertyType: '',
    });
  };

  return (
    <div className="admin-table-page flex min-h-full flex-col gap-5">

      {/* PAGE HEADER */}
      <PageHeader
        title="Hotels"
        description="Every hotel in Gokaasa, including drafts awaiting verification."
        actions={
          <>
            <Link
              to="/admin/hotels/onboarding"
              className={buttonVariants({ variant: 'primary' })}
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Import hotel
            </Link>

            <Link
              to="/admin/hotels/new"
              className={buttonVariants({ variant: 'secondary' })}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New hotel
            </Link>
          </>
        }
      />

      {/* FILTER PANEL */}
      <Card className="filter-panel grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6">

        <div className="relative xl:col-span-2">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden="true"
          />

          <Input
            aria-label="Search hotels by name or city"
            placeholder="Search name or city"
            className="pl-9"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>

        <Select
          aria-label="Filter by status"
          value={filters.status}
          onChange={(e) => updateFilters({ status: e.target.value })}
        >
          <option value="">All statuses</option>

          {HOTEL_STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Filter by property type"
          value={filters.propertyType}
          onChange={(e) => updateFilters({ propertyType: e.target.value })}
        >
          <option value="">All property types</option>

          {propertyTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        <Select
          aria-label="Filter by star rating"
          value={filters.starRating}
          onChange={(e) => updateFilters({ starRating: e.target.value })}
        >
          <option value="">Any star rating</option>

          {[5, 4, 3, 2, 1].map((stars) => (
            <option key={stars} value={stars}>
              {stars} star
            </option>
          ))}
        </Select>

        <Select
          aria-label="Sort hotels"
          value={filters.sort || 'updated_desc'}
          onChange={(e) => updateFilters({ sort: e.target.value })}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>

        {/* LOCATION FILTERS */}
        <div className="filter-location-row sm:col-span-2 xl:col-span-6">
          <span className="filter-group-label">Location</span>

          <Input
            aria-label="Filter by city"
            placeholder="City"
            value={filters.city}
            onChange={(e) =>
              updateFilters({ city: e.target.value.trim() })
            }
          />

          <Input
            aria-label="Filter by country code"
            placeholder="Country code (IN)"
            maxLength={2}
            value={filters.countryCode}
            onChange={(e) =>
              updateFilters({
                countryCode: e.target.value.toUpperCase(),
              })
            }
          />

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          )}
        </div>
      </Card>

      {/* ERROR MESSAGE */}
      {error && <Alert tone="error">{error}</Alert>}

      {/* HOTEL TABLE */}
      <Card className="admin-records-card w-full shrink-0 overflow-visible">

        {data === null && !error ? (
          <TableSkeleton rows={PAGE_SIZE} />
        ) : data?.items.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={
              hasFilters
                ? 'No hotels match these filters'
                : 'No hotels yet'
            }
            description={
              hasFilters
                ? 'Try changing or clearing your filters.'
                : 'Import your first hotel to get started.'
            }
            action={
              hasFilters ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={clearFilters}
                >
                  Clear filters
                </Button>
              ) : (
                <Link
                  to="/admin/hotels/onboarding"
                  className="text-sm font-medium text-brand-600 hover:underline"
                >
                  Import a hotel
                </Link>
              )
            }
          />
        ) : (
          <div className="w-full overflow-x-auto overflow-y-visible">

            <Table minWidth="820px">
              <caption className="sr-only">Hotels</caption>

              <TableHeader>
                <tr>
                  <TableHead className="w-16 text-center">
                    No.
                  </TableHead>

                  <TableHead>Hotel</TableHead>

                  <TableHead>Location</TableHead>

                  <TableHead>Rating</TableHead>

                  <TableHead>Rooms</TableHead>

                  <TableHead>Status</TableHead>

                  <TableHead>Last updated</TableHead>

                  <TableHead className="text-right">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </tr>
              </TableHeader>

              <TableBody>
                {data?.items.map((hotel, index) => (
                  <TableRow key={hotel.id}>

                    {/* SERIAL NUMBER */}
                    <TableCell className="text-center font-medium text-[var(--text-muted)]">
                      {(data.pagination.page - 1) * PAGE_SIZE +
                        index +
                        1}
                    </TableCell>

                    {/* HOTEL NAME */}
                    <TableCell>
                      <Link
                        to={`/admin/hotels/${hotel.id}`}
                        className="font-medium text-[var(--text-strong)] hover:text-brand-700"
                      >
                        {hotel.name}
                      </Link>

                      <p className="text-xs text-[var(--text-muted)]">
                        {hotel.propertyTypeName ??
                          hotel.propertyType
                            .replaceAll('_', ' ')
                            .toLowerCase()}
                      </p>
                    </TableCell>

                    {/* LOCATION */}
                    <TableCell className="text-[var(--text-body)]">
                      {[hotel.city, hotel.countryCode]
                        .filter(Boolean)
                        .join(', ')}
                    </TableCell>

                    {/* RATING */}
                    <TableCell>
                      {hotel.starRating ? (
                        <span className="inline-flex items-center gap-1 text-[var(--text-body)]">
                          <Star
                            className="h-3.5 w-3.5 fill-accent-500 text-accent-500"
                            aria-hidden="true"
                          />
                          {hotel.starRating}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">
                          —
                        </span>
                      )}
                    </TableCell>

                    {/* ROOMS */}
                    <TableCell className="text-[var(--text-body)]">
                      {hotel.roomTypeCount}
                    </TableCell>

                    {/* STATUS */}
                    <TableCell>
                      <HotelStatusBadge status={hotel.status} />
                    </TableCell>

                    {/* LAST UPDATED */}
                    <TableCell className="text-[var(--text-muted)]">
                      {formatDateTime(hotel.updatedAt)}
                    </TableCell>

                    {/* ACTIONS */}
                    <TableCell className="text-right">
                      <div className="inline-flex items-center justify-end gap-3">
                        <Link
                          to={`/admin/hotels/${hotel.id}`}
                          className="inline-flex items-center gap-1 font-medium text-brand-600 hover:text-brand-800 hover:underline"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          Edit
                        </Link>
                        {isAdmin && (
                          <button
                          type="button"
                          onClick={() => setHotelToDelete(hotel)}
                          className="inline-flex items-center gap-1 font-medium text-danger-600 hover:text-danger-800 hover:underline"
                          title={`Delete ${hotel.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Delete
                        </button>
                        )}
                      </div>
                    </TableCell>

                  </TableRow>
                ))}
              </TableBody>
            </Table>

          </div>
        )}
      </Card>

      {/* PAGINATION */}
      {data && data.pagination && data.pagination.totalPages > 1 && (
        <div className="flex w-full shrink-0 items-center justify-between gap-3">
          <p className="text-sm text-[var(--text-muted)]">
            Showing{' '}
            {(data.pagination.page - 1) * PAGE_SIZE + 1}
            {' '}–{' '}
            {(data.pagination.page - 1) * PAGE_SIZE +
              data.items.length}
            {' '}of{' '}
            {data.pagination.totalItems ?? 'all'} hotels
          </p>

          <Pagination
            page={data.pagination.page}
            totalPages={data.pagination.totalPages}
            onPageChange={(page) =>
              updateFilters({ page }, { resetPage: false })
            }
          />
        </div>
      )}

      <ConfirmDialog
        open={Boolean(hotelToDelete)}
        title={`Delete "${hotelToDelete?.name}"?`}
        description="Are you sure you want to delete this hotel? It will be removed from all lists and search. Hotels with active guest bookings cannot be deleted."
        confirmLabel="Delete hotel"
        tone="danger"
        loading={deletingHotel}
        onConfirm={confirmDeleteHotel}
        onCancel={() => setHotelToDelete(null)}
      />
    </div>
  );
}
