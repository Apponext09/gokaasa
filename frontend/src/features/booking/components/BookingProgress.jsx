import { Check } from 'lucide-react';
import { STEPS } from '../bookingFormat.js';
import { cn } from '@/lib/utils.js';

/** Search → Room → Guest details → Review → Payment → Confirmed. `current` is the index of the active step. */
export function BookingProgress({ current }) {
  const shortLabels = {
    search: 'Search',
    room: 'Room',
    guests: 'Guest',
    review: 'Review',
    payment: 'Pay',
    confirmed: 'Done',
  };

  return (
    <nav aria-label="Booking progress" className="mb-6">
      <ol className="flex items-center gap-2 overflow-x-auto text-xs sm:text-sm">
        {STEPS.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <li key={step.key} className="flex shrink-0 items-center gap-2" aria-current={active ? 'step' : undefined}>
              <span
                className={cn(
                  'grid h-6 w-6 place-items-center rounded-full border text-[11px] font-semibold',
                  done && 'border-success-600 bg-success-600 text-white',
                  active && 'border-brand-600 bg-brand-600 text-white',
                  !done && !active && 'border-[var(--border-subtle)] text-[var(--text-muted)]',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
              </span>
              <span
                data-short-label={shortLabels[step.key]}
                className={cn('booking-progress-label', active ? 'font-semibold text-[var(--text-strong)]' : 'text-[var(--text-muted)]')}
              >
                {step.label}
              </span>
              {index < STEPS.length - 1 && <span className="booking-progress-connector mx-1 h-px w-6 bg-[var(--border-subtle)] sm:w-10" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
