import { useEffect, useRef, useState } from 'react';
import { BedDouble, ChevronDown, Minus, Plus, Trash2, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { LIMITS, summarizeOccupancy } from '@/features/search/searchParams.js';
import { cn } from '@/lib/utils.js';

function Stepper({ label, hint, value, min, max, onChange, id }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div>
        <p id={`${id}-label`} className="text-sm font-medium text-[var(--text-strong)]">{label}</p>
        {hint && <p className="text-xs text-[var(--text-muted)]">{hint}</p>}
      </div>
      <div className="flex items-center gap-3" role="group" aria-labelledby={`${id}-label`}>
        <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)} className="grid h-8 w-8 place-items-center rounded-full border border-[var(--border-subtle)] disabled:opacity-35 hover:border-brand-500">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="w-5 text-center text-sm font-semibold tabular-nums" aria-live="polite">{value}</span>
        <button type="button" aria-label={`Increase ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)} className="grid h-8 w-8 place-items-center rounded-full border border-[var(--border-subtle)] disabled:opacity-35 hover:border-brand-500">
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Rooms and guests. Every room has its own adults and children, and each child has an age, because hotels
 * price and allocate by occupancy. The limits here match the server, so a valid form is always a valid search.
 */
export function GuestsPopover({ rooms, onChange, disabled = false, idPrefix = 'guests' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const updateRoom = (index, next) => onChange(rooms.map((room, i) => (i === index ? { ...room, ...next } : room)));

  const setChildren = (index, count) => {
    const current = rooms[index].childAges;
    const ages = count > current.length
      ? [...current, ...Array(count - current.length).fill(7)]
      : current.slice(0, count);
    updateRoom(index, { childAges: ages });
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        id={`${idPrefix}-trigger`}
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-14 w-full items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-card)] px-4 text-left focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <span className="flex min-w-0 flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">Rooms &amp; guests</span>
          <span className="truncate text-sm font-medium text-[var(--text-strong)]">{summarizeOccupancy(rooms)}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="fixed inset-x-3 bottom-3 z-40 max-h-[75vh] overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-4 shadow-lg sm:absolute sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:w-96" role="dialog" aria-label="Rooms and guests">
          <div className="space-y-4">
            {rooms.map((room, index) => (
              <section key={index} className="rounded-lg border border-[var(--border-subtle)] p-3" aria-label={`Room ${index + 1}`}>
                <header className="mb-1 flex items-center justify-between">
                  <p className="flex items-center gap-2 text-sm font-semibold text-[var(--text-strong)]">
                    <BedDouble className="h-4 w-4 text-brand-700" aria-hidden="true" /> Room {index + 1}
                  </p>
                  {rooms.length > 1 && (
                    <button type="button" onClick={() => onChange(rooms.filter((_, i) => i !== index))} className="inline-flex items-center gap-1 text-xs text-danger-600 hover:underline">
                      <Trash2 className="h-3.5 w-3.5" /> Remove
                    </button>
                  )}
                </header>
                <Stepper
                  id={`${idPrefix}-${index}-adults`}
                  label="Adults"
                  hint="Ages 13 and above"
                  value={room.adults}
                  min={LIMITS.minAdults}
                  max={LIMITS.maxAdults}
                  onChange={(adults) => updateRoom(index, { adults })}
                />
                <Stepper
                  id={`${idPrefix}-${index}-children`}
                  label="Children"
                  hint="Ages 0 to 17"
                  value={room.childAges.length}
                  min={0}
                  max={LIMITS.maxChildrenPerRoom}
                  onChange={(count) => setChildren(index, count)}
                />
                {room.childAges.length > 0 && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {room.childAges.map((age, childIndex) => (
                      <label key={childIndex} className="flex flex-col gap-1 text-xs text-[var(--text-muted)]">
                        Age of child {childIndex + 1}
                        <select
                          value={age}
                          onChange={(event) =>
                            updateRoom(index, { childAges: room.childAges.map((a, i) => (i === childIndex ? Number(event.target.value) : a)) })
                          }
                          className="h-9 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-card)] px-2 text-sm text-[var(--text-strong)]"
                        >
                          {Array.from({ length: LIMITS.maxAge + 1 }, (_, n) => (
                            <option key={n} value={n}>{n} {n === 1 ? 'year' : 'years'}</option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between gap-3">
            <Button variant="ghost" size="sm" disabled={rooms.length >= LIMITS.maxRooms} onClick={() => onChange([...rooms, { adults: 2, childAges: [] }])}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Add room
            </Button>
            <Button size="sm" onClick={() => setOpen(false)}>
              <UserRound className="h-4 w-4" aria-hidden="true" /> Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
