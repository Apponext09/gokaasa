import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, CalendarCheck, Star } from 'lucide-react';
import { Card, Skeleton, Alert, Badge } from '@/components/ui/surfaces.jsx';
import { PageHeader, formatDateTime, formatMoney } from '@/components/shared/index.jsx';
import { HotelStatusBadge } from '@/components/shared/index.jsx';
import { adminApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

function StatCard({ icon: Icon, label, value }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700"><Icon className="h-4 w-4" aria-hidden="true" /></span>
      <span>
        <span className="block text-lg font-semibold text-[var(--text-strong)]">{value}</span>
        <span className="block text-xs text-[var(--text-muted)]">{label}</span>
      </span>
    </Card>
  );
}

export function ManagerDetailPage() {
  const { id } = useParams();
  const [manager, setManager] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .getManager(id)
      .then((result) => !cancelled && setManager(result))
      .catch((err) => !cancelled && setError(normalizeError(err).message));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="space-y-4">
        <Link to="/admin/managers" className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-strong)]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Managers</Link>
        <Alert tone="error">{error}</Alert>
      </div>
    );
  }
  if (!manager) {
    return <div className="space-y-4">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-24 w-full" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <Link to="/admin/managers" className="inline-flex items-center gap-1.5 text-sm text-[var(--text-muted)] hover:text-[var(--text-strong)]"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> Managers</Link>
      <PageHeader title={`${manager.firstName} ${manager.lastName}`} description={manager.email} />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Building2} label="Assigned hotels" value={manager.hotels.length} />
        <StatCard icon={CalendarCheck} label="Bookings at these hotels" value={manager.bookings.total} />
        <StatCard icon={Star} label="Pending reviews" value={manager.reviews.pending} />
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-base font-semibold text-[var(--text-strong)]">Revenue across assigned hotels</h2>
        <p className="text-2xl font-semibold tracking-tight text-[var(--text-strong)]">{formatMoney(manager.bookings.revenueMinor)}</p>
        <p className="text-xs text-[var(--text-muted)]">Lifetime total across every booking at this manager's hotels, not an availability-checked figure.</p>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border-subtle)] p-4"><h2 className="text-base font-semibold text-[var(--text-strong)]">Assigned hotels</h2></div>
        {manager.hotels.length === 0 ? (
          <p className="p-5 text-sm text-[var(--text-muted)]">Not assigned to any hotel yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {manager.hotels.map((hotel) => (
              <li key={hotel.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <Link to={`/admin/hotels/${hotel.id}`} className="font-medium text-[var(--text-strong)] hover:text-brand-700">{hotel.name}</Link>
                  <p className="text-xs text-[var(--text-muted)]">{hotel.city} · Assigned {formatDateTime(hotel.assignedAt)}</p>
                </div>
                <HotelStatusBadge status={hotel.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-[var(--border-subtle)] p-4"><h2 className="text-base font-semibold text-[var(--text-strong)]">Recent bookings</h2></div>
        {manager.recentBookings.length === 0 ? (
          <p className="p-5 text-sm text-[var(--text-muted)]">No bookings yet.</p>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {manager.recentBookings.map((booking) => (
              <li key={booking.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <Link to={`/admin/bookings/${booking.id}`} className="font-medium text-[var(--text-strong)] hover:text-brand-700">{booking.bookingRef}</Link>
                  <p className="text-xs text-[var(--text-muted)]">{booking.hotelName}</p>
                </div>
                <div className="text-right">
                  <Badge tone="neutral">{booking.status}</Badge>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">{formatMoney(booking.totalMinor)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
