import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { nightsBetween, isIsoDate } from '@/features/search/searchParams.js';
import { cn } from '@/lib/utils.js';

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const longDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortDate = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekday = (iso) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' });
const referenceDate = (iso) => {
  const date = new Date(`${iso}T00:00:00Z`);
  const day = date.getUTCDate();
  const month = date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${day} ${month} '${String(date.getUTCFullYear()).slice(-2)}`;
};

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
 *
 * `inline` renders a compact, always-in-flow calendar instead of a floating popover -- used inside the
 * booking assistant chat panel, where a viewport-width-based popover can get clipped by the panel's small,
 * fixed size. Once both dates are picked it collapses to a one-line summary with a "Change" action, which
 * is the "automatically close the calendar and show the selected range" behavior; picking check-in alone
 * keeps the same calendar visible and switches its hint to check-out, which is the "automatically open
 * checkout" behavior without a second popup.
 */
export function DateRangePicker({
  checkIn,
  checkOut,
  onChange,
  onComplete,
  onCheckInSelect,
  onCheckOutSelect,
  onCheckInClick,
  onCheckOutClick,
  min,
  idPrefix = 'stay',
  disabled = false,
  bare = false,
  inline = false,
  isOpen,
  onOpenChange,
  activeTarget: controlledActiveTarget,
  onTargetChange,
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = isOpen !== undefined;
  const open = isControlled ? isOpen : internalOpen;

  const setOpen = (val) => {
    onOpenChange?.(val);
    if (!isControlled) setInternalOpen(val);
  };

  const [internalTarget, setInternalTarget] = useState(() => (!checkIn ? 'checkIn' : 'checkOut'));
  const activeTarget = controlledActiveTarget !== undefined ? controlledActiveTarget : internalTarget;
  const setActiveTarget = (target) => {
    if (open) {
      onTargetChange?.(target);
    }
    if (controlledActiveTarget === undefined) setInternalTarget(target);
  };
  const [editing, setEditing] = useState(() => !(checkIn && checkOut));
  const anchor = checkIn && isIsoDate(checkIn) ? checkIn : min;
  const [cursor, setCursor] = useState(() => ({ year: Number(anchor.slice(0, 4)), month: Number(anchor.slice(5, 7)) - 1 }));
  const ref = useRef(null);
  const nights = nightsBetween(checkIn, checkOut);

  useEffect(() => {
    if (!open) return;
    if (!checkIn) {
      setActiveTarget('checkIn');
    } else if (!checkOut) {
      setActiveTarget('checkOut');
    }
  }, [open, checkIn, checkOut]);

  useEffect(() => {
    if (open) {
      const targetDate = activeTarget === 'checkOut' && checkOut && isIsoDate(checkOut)
        ? checkOut
        : checkIn && isIsoDate(checkIn)
          ? checkIn
          : min;
      if (targetDate && isIsoDate(targetDate)) {
        setCursor({
          year: Number(targetDate.slice(0, 4)),
          month: Number(targetDate.slice(5, 7)) - 1,
        });
      }
    }
  }, [open, activeTarget]);

  useEffect(() => {
    if (inline && !checkIn && !checkOut) setEditing(true);
  }, [inline, checkIn, checkOut]);

  useEffect(() => {
    if (!open || inline || isControlled) return undefined;
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
  }, [open, inline, isControlled]);

  const cells = useMemo(() => monthGrid(cursor.year, cursor.month), [cursor]);
  const monthLabel = new Date(Date.UTC(cursor.year, cursor.month, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const minMonth = Number(min.slice(0, 4)) * 12 + Number(min.slice(5, 7)) - 1;
  const shownMonth = cursor.year * 12 + cursor.month;

  const pick = (day) => {
    if (day < min) return;

    if (!checkIn || activeTarget === 'checkIn' || (checkIn && checkOut && activeTarget !== 'checkOut')) {
      onChange({ checkIn: day, checkOut: null });
      setActiveTarget('checkOut');
      onCheckInSelect?.(day);
      return;
    }

    if (day <= checkIn) {
      onChange({ checkIn: day, checkOut: null });
      setActiveTarget('checkOut');
      onCheckInSelect?.(day);
      return;
    }

    onChange({ checkIn, checkOut: day });
    setOpen(false);
    setEditing(false);
    onCheckOutSelect?.(day);
    onComplete?.({ checkIn, checkOut: day });
  };

  const shift = (delta) => {
    setCursor((c) => {
      const next = new Date(Date.UTC(c.year, c.month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });
  };

  const hint = (activeTarget === 'checkIn' || !checkIn)
    ? 'Select check-in'
    : (!checkOut || activeTarget === 'checkOut')
      ? 'Now select check-out'
      : (nights ? `${nights} night${nights === 1 ? '' : 's'}` : null);

  if (inline) {
    if (!editing && checkIn && checkOut) {
      return (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] px-3 py-2">
          <div className="min-w-0 text-sm">
            <span className="font-semibold text-[var(--text-strong)]">{referenceDate(checkIn)}</span>
            <span className="px-1 text-[var(--text-muted)]">→</span>
            <span className="font-semibold text-[var(--text-strong)]">{referenceDate(checkOut)}</span>
            <span className="ml-1.5 text-xs text-[var(--text-muted)]">({nights} night{nights === 1 ? '' : 's'})</span>
          </div>
          <button type="button" onClick={() => setEditing(true)} className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-brand-500">
            Change
          </button>
        </div>
      );
    }

    return (
      <div className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-card)] p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" aria-label="Previous month" disabled={shownMonth <= minMonth} onClick={() => shift(-1)} className="grid h-6 w-6 place-items-center rounded-full hover:bg-[var(--surface-muted)] disabled:opacity-30">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <p className="text-xs font-semibold text-[var(--text-strong)]">{monthLabel}</p>
          <button type="button" aria-label="Next month" onClick={() => shift(1)} className="grid h-6 w-6 place-items-center rounded-full hover:bg-[var(--surface-muted)]">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-y-0.5 text-center text-[10px] font-medium text-[var(--text-muted)]">
          {WEEKDAYS.map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div role="grid" aria-label={monthLabel} className="mt-0.5 grid grid-cols-7 gap-y-0.5">
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
                  'mx-auto grid h-7 w-7 place-items-center rounded-full text-xs transition-colors focus-visible:outline-2 focus-visible:outline-brand-500',
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
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] pt-2 text-xs">
          <span className="text-[var(--text-muted)]" aria-live="polite">{hint ?? (nights ? `${nights} night${nights === 1 ? '' : 's'}` : '')}</span>
          {checkIn && (
            <button type="button" onClick={() => onChange({ checkIn: null, checkOut: null })} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]">
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className={cn('relative', bare && 'customer-date-range')}>
      <div
        className={cn(
          'grid grid-cols-2',
          bare ? 'customer-date-fields gap-3' : 'divide-x divide-[var(--border-subtle)]',
          !bare && 'rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-card)]',
        )}
      >
        <button
          type="button"
          id={`${idPrefix}-checkin`}
          disabled={disabled}
          onClick={() => {
            setActiveTarget('checkIn');
            setOpen(true);
            onCheckInClick?.();
          }}
          className={cn(
            'flex min-h-14 flex-col items-start px-4 py-2 text-left focus-visible:outline-2 focus-visible:outline-brand-500',
            bare && 'customer-date-field',
            bare && open && activeTarget === 'checkIn' && 'bg-slate-50/90 rounded-lg',
            !bare && open && activeTarget === 'checkIn' && 'bg-slate-100/70',
          )}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Check-in</span>
          <span className="customer-date-value flex w-full items-center justify-between gap-1 text-sm font-semibold whitespace-nowrap text-[var(--text-strong)]">
            {checkIn ? referenceDate(checkIn) : 'Add date'}
            {bare && <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />}
          </span>
          {bare && checkIn && <span className="text-xs text-[var(--text-muted)]">{weekday(checkIn)}</span>}
        </button>
        <button
          type="button"
          id={`${idPrefix}-checkout`}
          disabled={disabled}
          onClick={() => {
            setActiveTarget('checkOut');
            setOpen(true);
            onCheckOutClick?.();
          }}
          className={cn(
            'flex min-h-14 flex-col items-start px-4 py-2 text-left focus-visible:outline-2 focus-visible:outline-brand-500',
            bare && 'customer-date-field',
            bare && open && activeTarget === 'checkOut' && 'bg-slate-50/90 rounded-lg',
            !bare && open && activeTarget === 'checkOut' && 'bg-slate-100/70',
          )}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Check-out</span>
          <span className="customer-date-value flex w-full items-center justify-between gap-1 text-sm font-semibold whitespace-nowrap text-[var(--text-strong)]">
            {checkOut ? referenceDate(checkOut) : 'Add date'}
            {bare && <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-muted)]" aria-hidden="true" />}
          </span>
          {bare && checkOut && <span className="text-xs text-[var(--text-muted)]">{weekday(checkOut)}</span>}
        </button>
      </div>

      {open && (
        <>
        <button
          type="button"
          className="customer-date-backdrop fixed inset-0 z-[60] bg-slate-950/45 sm:hidden"
          aria-label="Close calendar"
          onClick={() => setOpen(false)}
        />
        <div className="customer-date-dialog fixed inset-x-2 bottom-2 z-[70] rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:z-40 sm:mt-2 sm:w-[22rem]" role="dialog" aria-label="Choose dates">
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
              <button
                type="button"
                onClick={() => {
                  onChange({ checkIn: null, checkOut: null });
                  setActiveTarget('checkIn');
                }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[var(--text-muted)] hover:bg-[var(--surface-muted)]"
              >
                <X className="h-3.5 w-3.5" /> Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (checkIn && checkOut) {
                    onComplete?.({ checkIn, checkOut });
                  }
                }}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-brand-700 hover:bg-brand-50"
              >
                <CalendarDays className="h-3.5 w-3.5" /> Done
              </button>
            </div>
          </div>
        </div>
        </>
      )}
    </div>
  );
}
