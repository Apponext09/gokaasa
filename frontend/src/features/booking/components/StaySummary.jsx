import { Bed, CalendarDays, MapPin, ShieldCheck, Users } from 'lucide-react';
import { SafeImage } from '@/components/shared/SafeImage.jsx';
import { formatMoneyMinor, formatStayDate, occupancyLabel } from '../bookingFormat.js';

/** The booking's facts and price breakdown. Shown from the server's quote, never from the browser's own numbers. */
export function StaySummary({ quote, className = '' }) {
  const { hotel, room, ratePlan, cancellationPolicy, stay, totals, coupon } = quote;
  const money = (minor) => formatMoneyMinor(minor, totals.currency);
  return (
    <article className={`stay-summary overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] shadow-sm ${className}`} aria-label="Booking summary">
      <div className="stay-summary-media aspect-[16/9] bg-[var(--surface-muted)]">
        <SafeImage src={hotel.imageUrl} alt={hotel.name} className="h-full w-full object-cover" sizes="(min-width: 1024px) 22rem, 100vw" />
      </div>
      <div className="stay-summary-body space-y-4 p-5">
        <div className="stay-summary-identity">
          <h2 className="text-lg font-semibold text-[var(--text-strong)]">{hotel.name}</h2>
          <p className="flex items-start gap-1.5 text-sm text-[var(--text-muted)]">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {hotel.address}
          </p>
        </div>

        <dl className="stay-summary-facts grid gap-3 text-sm">
          <div className="flex gap-2">
            <Bed className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
            <div>
              <dt className="sr-only">Room</dt>
              <dd className="font-medium text-[var(--text-strong)]">{room.name}</dd>
              <dd className="text-[var(--text-muted)]">
                {ratePlan.name} · {ratePlan.mealPlan.replace(/_/g, ' ').toLowerCase()}
              </dd>
            </div>
          </div>
          <div className="flex gap-2">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
            <div>
              <dt className="sr-only">Dates</dt>
              <dd className="font-medium text-[var(--text-strong)]">
                {formatStayDate(stay.checkIn)} → {formatStayDate(stay.checkOut)}
              </dd>
              <dd className="text-[var(--text-muted)]">
                {stay.nights} night{stay.nights === 1 ? '' : 's'} · check-in from {hotel.checkInAt ? new Date(hotel.checkInAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: hotel.timeZone }) : '2:00 PM'}
              </dd>
            </div>
          </div>
          <div className="flex gap-2">
            <Users className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
            <dd className="text-[var(--text-body)]">{occupancyLabel(stay.occupancy)}</dd>
          </div>
          <div className="flex gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />
            <div>
              <dt className="font-medium text-[var(--text-strong)]">Cancellation</dt>
              <dd className="text-[var(--text-muted)]">{cancellationPolicy.description}</dd>
            </div>
          </div>
        </dl>

        <div className="stay-summary-price space-y-1.5 border-t border-[var(--border-subtle)] pt-4 text-sm" aria-label="Price breakdown">
          <Row label={`${stay.rooms} room${stay.rooms === 1 ? '' : 's'} × ${stay.nights} night${stay.nights === 1 ? '' : 's'}`} value={money(totals.subtotal)} />
          {totals.discount > 0 && <Row label="Discount" value={`−${money(totals.discount)}`} tone="success" />}
          <Row label="Taxes" value={money(totals.taxes)} />
          <Row label="Fees" value={money(totals.fees)} />
          {coupon && <Row label={`Coupon (${coupon.code})`} value={`−${money(totals.couponDiscount)}`} tone="success" />}
          <div className="flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-3 text-base">
            <span className="font-semibold text-[var(--text-strong)]">Total</span>
            <span className="text-lg font-semibold text-[var(--text-strong)]" data-testid="total-amount">{money(totals.total)}</span>
          </div>
        </div>
      </div>
    </article>
  );
}

function Row({ label, value, tone }) {
  return (
    <div className="flex items-center justify-between text-[var(--text-body)]">
      <span>{label}</span>
      <span className={tone === 'success' ? 'text-success-600' : undefined}>{value}</span>
    </div>
  );
}
