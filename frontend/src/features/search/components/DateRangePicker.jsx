import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { nightsBetween, isIsoDate } from '@/features/search/searchParams.js';
import { cn } from '@/lib/utils.js';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const longDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** Month grid for a given year and month (0-based), Monday first, all in UTC date arithmetic. */
function monthGrid(year, month) {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < offset; i += 1) cells.push(null);
  for (let d = 1; d <= days; d += 1) cells.push(new Date(Date.UTC(year, month, d)).toISOString().slice(0, 10));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/**
 * Date-only range picker for hotel stays. Check-out can never be on or before check-in, past days are
 * disabled, and the nights count is shown. Works with touch and keyboard.
 */
export function DateRangePicker({ checkIn, checkOut, onChange, min, idPrefix = 'stay', disabled = false, bare = false }) {
  const [open, setOpen] = useState(false);
  const anchor = checkIn && isIsoDate(checkIn) ? checkIn : min;
  const [cursor, setCursor] = useState(() => ({ year: Number(anchor.slice(0, 4)), month: Number(anchor.slice(5, 7)) - 1 }));
  const ref = useRef(null);
  const nights = nightsBetween(checkIn, checkOut);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const cells = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const monthLabel = new Date(Date.UTC(cursor.year, cursor.month, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const minMonth = Number(min.slice(0, 4)) * 12 + Number(min.slice(5, 7)) - 1;
  const shownMonth = cursor.year * 12 + cursor.month;

  const pick = (day) => {
    if (day < min) return;
    if (!checkIn || (checkIn && checkOut) || day <= checkIn) {
      onChange({ checkIn: day, checkOut: null });
      return;
    }
    onChange({ checkIn, checkOut: day });
    setOpen(false);
  };

  const shift = (delta) => {
    setCursor((c) => {
      const next = new Date(Date.UTC(c.year, c.month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });
  };

  const hint = !checkIn ? 'Select check-in' : !checkOut ? 'Now select check-out' : null;

  return (
    <div ref={ref} className="relative">
      <div
        className={cn(
          'grid grid-cols-2 divide-x divide-[var(--border-subtle)]',
          !bare && 'rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-card)]',
        )}
      >
        <button
          type="button"
          id={`${idPrefix}-checkin`}
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="flex min-h-14 flex-col items-start px-4 py-2 text-left focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Check-in</span>
          <span className="text-sm font-medium text-[var(--text-strong)]">{checkIn ? longDate(checkIn).replace(/^\w+, /, '') : 'Add date'}</span>
        </button>
        <button
          type="button"
          id={`${idPrefix}-checkout`}
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="flex min-h-14 flex-col items-start px-4 py-2 text-left focus-visible:outline-2 focus-visible:outline-brand-500"
        >
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Check-out</span>
          <span className="text-sm font-medium text-[var(--text-strong)]">{checkOut ? longDate(checkOut).replace(/^\w+, /, '') : 'Add date'}</span>
        </button>
      </div>
      {nights > 0 && (
        <p className="mt-1.5 text-xs font-medium text-brand-700" aria-live="polite">
          {checkIn && checkOut ? `${shortDate(checkIn)} → ${shortDate(checkOut)} · ${nights} night${nights === 1 ? '' : 's'}` : ''}
        </p>
      )}

      {open && (
        <div className="fixed inset-x-3 bottom-3 z-40 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-lg sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:w-[22rem]" role="dialog" aria-label="Choose dates">
          <div className="mb-3 flex items-center justify-between">
            <button type="button" aria-label="Previous month" disabled={shownMonth <= minMonth} onClick={() => shift(-1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--surface-muted)] disabled:opacity-30">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-sm font-semibold text-[var(--text-strong)]">{monthLabel}</p>
            <button type="button" aria-label="Next month" onClick={() => shift(1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-[var(--surface-muted)]">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-y-1 text-center text-[11px] font-medium text-[var(--text-muted)]">
            {WEEKDAYS.map((w) => (
              <span key={w}>{w}</span>
            ))}
          </div>
          <div role="grid" aria-label={monthLabel} className="mt-1 grid grid-cols-7 gap-y-1">
            {cells.map((day, index) => {
              if (!day) return <span key={`blank-${index}`} />;
              const isPast = day < min;
              const isStart = day === checkIn;
              const isEnd = day === checkOut;
              const inRange = checkIn && checkOut && day > checkIn && day < checkOut;
              return (
                <button
                  key={day}
                  type="button"
                  role="gridcell"
                  aria-label={longDate(day)}
                  aria-selected={isStart || isEnd || undefined}
                  disabled={isPast}
                  onClick={() => pick(day)}
                  className={cn(
                    'mx-auto grid h-9 w-9 place-items-center rounded-full text-sm transition-colors focus-visible:outline-2 focus-visible:outline-brand-500',
                    isPast && 'cursor-not-allowed text-[var(--text-muted)]/50 line-through',
                    !isPast && 'hover:bg-brand-50',
                    inRange && 'rounded-none bg-brand-50 text-brand-800 w-full',
                    (isStart || isEnd) && 'bg-brand-600 font-semibold text-white hover:bg-brand-700',
                    day === min && !isStart && 'ring-1 ring-brand-200',
                  )}
                >
                  {Number(day.slice(8))}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--border-subtle)] pt-3 text-sm">
            <span className="text-[var(--text-muted)]" aria-live="polite">{hint ?? (nights ? `${nights} night${nights === 1 ? '' : 's'}` : '')}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => onChange({ checkIn: null, checkOut: null })} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]">
                <X className="h-3.5 w-3.5" /> Clear
              </button>
              <button type="button" onClick={() => setOpen(false)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-brand-700 hover:bg-brand-50">
                <CalendarDays className="h-3.5 w-3.5" /> Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
