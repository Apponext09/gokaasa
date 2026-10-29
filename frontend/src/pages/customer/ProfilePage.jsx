import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronRight, Heart, Luggage, Mail, ShieldCheck, Tag, UserRound, Users } from 'lucide-react';
import { Card, Badge, Skeleton } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { PageHeader } from '@/components/shared/index.jsx';
import { SafeImage } from '@/components/shared/SafeImage.jsx';
import { BOOKING_STATUS_LABEL, formatMoneyMinor, formatStayDate } from '@/features/booking/bookingFormat.js';
import { useAuth } from '@/features/auth/AuthContext.jsx';
import { homePathFor } from '@/features/auth/routing.js';
import { StaffEmailChangePanel } from '@/features/auth/StaffEmailChangePanel.jsx';
import { setStaffCustomerView } from '@/features/auth/viewMode.js';
import { useDocumentMeta } from '@/hooks/useDocumentMeta.js';
import { bookingApi } from '@/services/endpoints.js';

const QUICK_ACTIONS = [
  { to: '/my-trips', label: 'My Bookings', icon: Luggage },
  { to: '/wishlist', label: 'Wishlist', icon: Heart },
  { to: '/offers', label: 'Offers', icon: Tag },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** The next upcoming trip, as a large hero card -- the same trip summary shape My Trips already uses. */
function NextStayCard({ trip }) {
  const status = BOOKING_STATUS_LABEL[trip.status] ?? BOOKING_STATUS_LABEL.PAYMENT_PENDING;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col sm:flex-row">
        <div className="aspect-[16/10] w-full shrink-0 sm:aspect-auto sm:w-64">
          <SafeImage src={trip.hotel.imageUrl} alt={trip.hotel.name} className="h-full w-full object-cover" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2 p-5">
          <Badge tone={status.tone} className="w-fit">{status.label}</Badge>
          <h3 className="truncate text-lg font-semibold text-[var(--text-strong)]">{trip.hotel.name}</h3>
          <p className="text-sm text-[var(--text-muted)]">{trip.hotel.city}</p>
          <p className="flex items-center gap-1.5 text-sm text-[var(--text-body)]">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {formatStayDate(trip.checkIn, { day: 'numeric', month: 'short' })} → {formatStayDate(trip.checkOut, { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <div className="mt-auto flex items-center justify-between pt-2">
            <span className="text-sm font-semibold text-[var(--text-strong)]">{formatMoneyMinor(trip.totalMinor, trip.currency)}</span>
            <Link to={`/my-trips/${trip.id}`}>
              <Button size="sm">View Booking</Button>
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}

function RecentTripRow({ trip }) {
  const status = BOOKING_STATUS_LABEL[trip.status] ?? BOOKING_STATUS_LABEL.PAYMENT_PENDING;
  return (
    <Link to={`/my-trips/${trip.id}`} className="flex items-center gap-3 rounded-[var(--radius-control)] p-3 transition-colors hover:bg-[var(--surface-muted)]">
      <div className="h-12 w-16 shrink-0 overflow-hidden rounded-[var(--radius-control)] bg-[var(--surface-muted)]">
        <SafeImage src={trip.hotel.imageUrl} alt={trip.hotel.name} className="h-full w-full object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-[var(--text-strong)]">{trip.hotel.name}</p>
        <p className="text-xs text-[var(--text-muted)]">{formatStayDate(trip.checkIn, { day: 'numeric', month: 'short' })} → {formatStayDate(trip.checkOut, { day: 'numeric', month: 'short' })}</p>
      </div>
      <Badge tone={status.tone}>{status.label}</Badge>
    </Link>
  );
}

export function ProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [upcoming, setUpcoming] = useState(null);

  useDocumentMeta({ title: 'My Account | Gokaasa', description: 'Your Gokaasa account and upcoming stays.' });

  useEffect(() => {
    let cancelled = false;
    bookingApi.myTrips('upcoming').then((result) => !cancelled && setUpcoming(result.items)).catch(() => !cancelled && setUpcoming([]));
    return () => { cancelled = true; };
  }, []);

  const [nextStay, ...rest] = upcoming ?? [];
  const isNonCustomer = user?.roles?.some((role) => role !== 'CUSTOMER');

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-10 sm:px-6">
      <PageHeader title={`${greeting()}, ${user?.firstName ?? 'there'}`} description="Your Gokaasa account and upcoming stays." />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Your next stay</h2>
        {upcoming === null ? (
          <Skeleton className="h-40 w-full rounded-[var(--radius-card)]" />
        ) : nextStay ? (
          <NextStayCard trip={nextStay} />
        ) : (
          <Card className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-[var(--text-muted)]">No upcoming stays yet. Your next trip is waiting to be discovered.</p>
            <Link to="/destinations"><Button size="sm">Explore Hotels</Button></Link>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Quick actions</h2>
        <div className="grid grid-cols-3 gap-3">
          {QUICK_ACTIONS.map(({ to, label, icon: Icon }) => (
            <Link key={to} to={to} className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 text-center transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-sm">
              <Icon className="h-5 w-5 text-brand-700" aria-hidden="true" />
              <span className="text-sm font-medium text-[var(--text-strong)]">{label}</span>
            </Link>
          ))}
        </div>
      </section>

      {rest.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Recent bookings</h2>
          <Card className="divide-y divide-[var(--border-subtle)] p-1">
            {rest.slice(0, 3).map((trip) => <RecentTripRow key={trip.id} trip={trip} />)}
          </Card>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-muted)]">Account</h2>
        <Card className="divide-y divide-[var(--border-subtle)]">
          <div className="flex items-center gap-3 p-5">
            <UserRound className="h-5 w-5 text-brand-700" aria-hidden="true" />
            <div>
              <p className="text-xs text-[var(--text-muted)]">Name</p>
              <p className="text-sm font-medium text-[var(--text-strong)]">{user?.firstName} {user?.lastName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-5">
            <Mail className="h-5 w-5 text-brand-700" aria-hidden="true" />
            <div>
              <p className="text-xs text-[var(--text-muted)]">Email</p>
              <p className="text-sm font-medium text-[var(--text-strong)]">{user?.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-5">
            <ShieldCheck className="h-5 w-5 text-brand-700" aria-hidden="true" />
            <div>
              <p className="text-xs text-[var(--text-muted)]">Account type</p>
              <p className="text-sm font-medium capitalize text-[var(--text-strong)]">{user?.roles?.join(', ').toLowerCase()}</p>
            </div>
          </div>
          {isNonCustomer && (
            <button
              type="button"
              onClick={() => {
                setStaffCustomerView(false);
                navigate(homePathFor(user));
              }}
              className="flex w-full items-center gap-3 p-5 text-left transition-colors hover:bg-[var(--surface-muted)]"
            >
              <Users className="h-5 w-5 text-brand-700" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-xs text-[var(--text-muted)]">Browsing</p>
                <p className="text-sm font-medium text-[var(--text-strong)]">Return to staff workspace</p>
              </div>
              <ChevronRight className="h-4 w-4 text-[var(--text-muted)]" aria-hidden="true" />
            </button>
          )}
        </Card>
        <p className="text-xs text-[var(--text-muted)]">Editing your name or password isn't available yet -- contact support if you need a change.</p>
      </section>

      {isNonCustomer && <StaffEmailChangePanel />}
    </div>
  );
}
