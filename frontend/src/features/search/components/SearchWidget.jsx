import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { DestinationField } from '@/features/search/components/DestinationField.jsx';
import { DateRangePicker } from '@/features/search/components/DateRangePicker.jsx';
import { GuestsPopover } from '@/features/search/components/GuestsPopover.jsx';
import { addDays, slugifyPlace, stayParams, todayIso, validateStay } from '@/features/search/searchParams.js';
import { cn } from '@/lib/utils.js';

const titleCase = (slug) => slug.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

/** Where the search goes for a chosen destination. Hotels open directly; places open the results list. */
export function searchTargetFor(destination, stay, occupancy) {
  const params = stayParams({ ...stay, occupancy });
  if (destination.type === 'HOTEL' && destination.hotelSlug) {
    return `/hotels/${destination.destination}/${destination.hotelSlug}?${params}`;
  }
  if (destination.type === 'AREA' && destination.area) params.set('area', destination.area);
  return `/hotels/${destination.destination}?${params}`;
}

/**
 * The search form used on the homepage (hero) and in the results header (compact). The same component, so
 * the rules are the same everywhere: a valid stay, a destination, and a per-room occupancy.
 */
export function SearchWidget({ variant = 'hero', initial, onSubmitted }) {
  const navigate = useNavigate();
  const today = todayIso();
  const [destination, setDestination] = useState(
    initial?.destination ? { type: 'CITY', label: titleCase(initial.destination), destination: initial.destination, area: initial.area ?? null } : null,
  );
  const [typed, setTyped] = useState('');
  const [stay, setStay] = useState({
    checkIn: initial?.checkIn ?? addDays(today, 1),
    checkOut: initial?.checkOut ?? addDays(today, 3),
  });
  const [occupancy, setOccupancy] = useState(initial?.occupancy ?? [{ adults: 2, childAges: [] }]);
  const [error, setError] = useState(null);

  const submit = (event) => {
    event?.preventDefault();
    const stayProblem = validateStay(stay, today);
    if (stayProblem) {
      setError(stayProblem);
      return;
    }
    let target = destination;
    if (!target && typed.trim()) target = { type: 'TEXT', label: typed.trim(), destination: slugifyPlace(typed) };
    if (!target?.destination) {
      setError('Choose where you are going');
      return;
    }
    setError(null);
    navigate(searchTargetFor(target, stay, occupancy));
    onSubmitted?.();
  };

  const compact = variant === 'compact';

  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="Search hotels"
      className={cn(
        'w-full',
        compact
          ? 'grid grid-cols-1 gap-2 md:grid-cols-[1.4fr_1.3fr_1fr_auto] md:items-stretch'
          : 'rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-card)] p-3 shadow-sm md:p-4',
      )}
    >
      <div className={cn(!compact && 'grid grid-cols-1 gap-3 lg:grid-cols-[1.5fr_1.4fr_1fr_auto] lg:items-stretch')}>
        <DestinationField value={destination} onChange={setDestination} onTextChange={setTyped} />
      </div>
      <div className={cn(!compact && 'mt-3 lg:mt-0')}>
        <DateRangePicker
          idPrefix={variant}
          min={today}
          checkIn={stay.checkIn}
          checkOut={stay.checkOut}
          onChange={({ checkIn, checkOut }) => {
            setError(null);
            setStay((current) => ({
              checkIn: checkIn ?? current.checkIn,
              checkOut: checkOut ?? (checkIn ? null : current.checkOut),
            }));
          }}
        />
      </div>
      <div className={cn(!compact && 'mt-3 lg:mt-0')}>
        <GuestsPopover idPrefix={variant} rooms={occupancy} onChange={setOccupancy} />
      </div>
      <div className={cn(!compact && 'mt-3 lg:mt-0')}>
        <Button type="submit" size="lg" className={cn('w-full', !compact && 'h-14')}>
          <Search className="h-4 w-4" aria-hidden="true" /> Search Hotels
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger-600 md:col-span-4">
          {error}
        </p>
      )}
    </form>
  );
}
