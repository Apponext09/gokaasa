import { useState } from 'react';
import { BedDouble, Check, ChevronDown, Maximize2, ShieldCheck, Undo2, UtensilsCrossed, Users, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/surfaces.jsx';
import { Button } from '@/components/ui/button.jsx';
import { SafeImage } from '@/components/shared/SafeImage.jsx';
import { formatMoney } from '@/components/shared/index.jsx';
import { cn } from '@/lib/utils.js';

const MEAL_LABEL = { ROOM_ONLY: 'Room only', BREAKFAST: 'Breakfast included', HALF_BOARD: 'Half board', FULL_BOARD: 'Full board' };
const mealLabel = (code) => MEAL_LABEL[code] ?? String(code ?? 'Room rate').replaceAll('_', ' ').toLowerCase();
const BED_LABEL = { KING: 'King bed', QUEEN: 'Queen bed', DOUBLE: 'Double bed', TWIN: 'Twin beds', SINGLE: 'Single bed', SOFA_BED: 'Sofa bed', BUNK: 'Bunk beds' };
const UNAVAILABLE_TEXT = {
  SOLD_OUT: 'Sold out for these dates',
  CAPACITY: 'Does not fit your party',
  CLOSED: 'Closed for these dates',
  STAY_LENGTH: 'Not available for this length of stay',
  NO_RATES: 'No rates available for these dates',
};

/** Each rate plan, compared side by side: what it includes, its refund rule, and the price breakdown. */
function RatePlanRow({ plan, nights, rooms, onSelect, selected, disabled }) {
  const [open, setOpen] = useState(false);
  const cancelText = plan.cancellationPolicy?.description ?? 'Cancellation terms are not set for this rate.';
  const freeCancel = plan.refundable && plan.cancellationPolicy && !plan.cancellationPolicy.isNonRefundable && plan.cancellationPolicy.refundPercent === 100;

  return (
    <li className={cn('customer-rate-plan rounded-[var(--radius-control)] border p-3 transition-colors', selected ? 'is-selected border-brand-500 bg-brand-50/60' : 'border-[var(--border-subtle)]')}>
      <div className="rate-plan-layout flex flex-col gap-2.5 sm:flex-row sm:items-start sm:justify-between">
        <div className="rate-plan-copy min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-[var(--text-strong)]">{plan.name}</p>
            <Badge tone="brand"><UtensilsCrossed className="h-3 w-3" aria-hidden="true" /> {plan.mealPlanName ?? mealLabel(plan.mealPlan)}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {plan.refundable ? (
              freeCancel ? (
                <Badge tone="success"><ShieldCheck className="h-3 w-3" aria-hidden="true" /> Free cancellation</Badge>
              ) : (
                <Badge tone="neutral">Partly refundable</Badge>
              )
            ) : (
              <Badge tone="danger"><Undo2 className="h-3 w-3" aria-hidden="true" /> Non-refundable</Badge>
            )}
          </div>
          <p className="line-clamp-2 text-xs leading-5 text-[var(--text-muted)]">{cancelText}</p>
        </div>

        <div className="rate-plan-price flex shrink-0 flex-col items-start gap-2 sm:items-end">
          <p className="text-right">
            <span className="text-lg font-semibold tracking-tight text-[var(--text-strong)]">{formatMoney(plan.pricePerNight)}</span>
            <span className="text-sm text-[var(--text-muted)]"> / night</span>
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            {nights} Night{nights === 1 ? '' : 's'}{rooms > 1 ? ` · ${rooms} Rooms` : ''} · <span className="font-medium text-[var(--text-body)]">{formatMoney(plan.finalAmount)}</span> total
          </p>
          <Button size="sm" variant={selected ? 'secondary' : 'primary'} disabled={disabled} onClick={() => onSelect(plan)}>
            {selected ? <><Check className="h-4 w-4" aria-hidden="true" /> Selected</> : 'Select'}
          </Button>
        </div>
      </div>

      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="rate-plan-breakdown-toggle mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} aria-hidden="true" /> Price breakdown
      </button>
      {open && (
        <dl className="mt-2 grid max-w-sm grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
          <dt className="text-[var(--text-muted)]">Room charge ({nights} Night{nights === 1 ? '' : 's'})</dt>
          <dd className="text-right">{formatMoney(plan.subtotal)}</dd>
          {plan.discount > 0 && (
            <>
              <dt className="text-[var(--text-muted)]">Discount</dt>
              <dd className="text-right text-success-600">−{formatMoney(plan.discount)}</dd>
            </>
          )}
          <dt className="text-[var(--text-muted)]">Taxes</dt>
          <dd className="text-right">{formatMoney(plan.taxes)}</dd>
          <dt className="text-[var(--text-muted)]">Fees</dt>
          <dd className="text-right">{formatMoney(plan.fees)}</dd>
          <dt className="border-t border-[var(--border-subtle)] pt-1 font-semibold text-[var(--text-strong)]">Total</dt>
          <dd className="border-t border-[var(--border-subtle)] pt-1 text-right font-semibold text-[var(--text-strong)]">{formatMoney(plan.finalAmount)}</dd>
        </dl>
      )}
    </li>
  );
}

/** A room type with its rate plans. Unavailable rooms are listed with the reason, never silently removed. */
export function RoomCard({ room, nights, rooms, onSelect, selection, disabled }) {
  const [photo, setPhoto] = useState(0);
  const images = room.images ?? [];
  const current = images[photo];
  const scarce = room.available && room.availableRooms > 0 && room.availableRooms <= 3;

  return (
    <article className="customer-room-card overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)]">
      <div className="grid gap-0 md:grid-cols-[13rem_minmax(0,1fr)]">
        <div className="room-card-media relative">
          <SafeImage src={current?.url} alt={current?.altText ?? room.name} className="aspect-[16/7] w-full md:h-full md:aspect-auto md:min-h-40" sizes="(min-width: 768px) 208px, 100vw" fallbackLabel={`${room.name}: photos coming soon`} />
          {images.length > 1 && (
            <div className="absolute bottom-2 left-2 right-2 flex gap-1 overflow-x-auto">
              {images.map((image, i) => (
                <button key={image.id} type="button" onClick={() => setPhoto(i)} aria-label={`Show photo ${i + 1}`} aria-current={i === photo} className={cn('h-8 w-12 shrink-0 overflow-hidden rounded border-2', i === photo ? 'border-white' : 'border-transparent opacity-70')}>
                  <img src={image.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="room-card-content flex min-w-0 flex-col gap-3 p-4">
          <div className="room-card-summary space-y-1.5">
            <h3 className="text-base font-semibold tracking-tight text-[var(--text-strong)]">{room.name}</h3>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-body)]">
              {room.roomSizeSqm != null && (
                <li className="flex items-center gap-1.5"><Maximize2 className="h-3.5 w-3.5 text-brand-700" aria-hidden="true" /> {room.roomSizeSqm} m²</li>
              )}
              {room.bedType && (
                <li className="flex items-center gap-1.5"><BedDouble className="h-3.5 w-3.5 text-brand-700" aria-hidden="true" /> {BED_LABEL[room.bedType] ?? room.bedType}{room.bedCount > 1 ? ` × ${room.bedCount}` : ''}</li>
              )}
              {room.view && (
                <li className="flex items-center gap-1.5"><Eye className="h-3.5 w-3.5 text-brand-700" aria-hidden="true" /> {room.view}</li>
              )}
              <li className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-brand-700" aria-hidden="true" /> Up to {room.maxAdults} adult{room.maxAdults === 1 ? '' : 's'}{room.maxChildren > 0 ? `, ${room.maxChildren} child${room.maxChildren === 1 ? '' : 'ren'}` : ''}</li>
            </ul>
            {room.amenities?.length > 0 && (
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                {room.amenities.map((a) => (
                  <li key={a.code} className="flex items-center gap-1"><Check className="h-3 w-3 text-success-600" aria-hidden="true" /> {a.name}</li>
                ))}
              </ul>
            )}
            {scarce && <Badge tone="warning">Only {room.availableRooms} room{room.availableRooms === 1 ? '' : 's'} left</Badge>}
          </div>

          <ul className="space-y-2.5" aria-label={`Rate plans for ${room.name}`}>
            {room.ratePlans.map((plan) => (
              <RatePlanRow
                key={plan.ratePlanId}
                plan={plan}
                nights={nights}
                rooms={rooms}
                disabled={disabled}
                selected={selection?.roomTypeId === room.id && selection?.ratePlanId === plan.ratePlanId}
                onSelect={(p) => onSelect(room, p)}
              />
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}

export function UnavailableRooms({ rooms }) {
  if (rooms.length === 0) return null;
  return (
    <details className="rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4">
      <summary className="cursor-pointer text-sm font-medium text-[var(--text-body)]">
        {rooms.length} other room type{rooms.length === 1 ? '' : 's'} not available for these dates
      </summary>
      <ul className="mt-3 space-y-2 text-sm text-[var(--text-muted)]">
        {rooms.map((room) => (
          <li key={room.id} className="flex flex-wrap justify-between gap-2">
            <span className="text-[var(--text-body)]">{room.name}</span>
            <span>{UNAVAILABLE_TEXT[room.unavailableReason] ?? 'Not available'}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
