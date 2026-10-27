import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { DestinationField } from '@/features/search/components/DestinationField.jsx';
import { DateRangePicker } from '@/features/search/components/DateRangePicker.jsx';
import { GuestsPopover } from '@/features/search/components/GuestsPopover.jsx';
import { addDays, nightsBetween, stayParams, todayIso, validateStay } from '@/features/search/searchParams.js';

const titleCase = (slug) => slug.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

/** Where the search goes for a chosen destination. Hotels open directly; places open the Hotels listing page. */
function searchTargetFor(destination, stay, occupancy, coupon = null) {
  const params = stayParams({ ...stay, occupancy, coupon });
  // A specific hotel — go straight to its detail page
  if (destination.type === 'HOTEL' && destination.hotelSlug) {
    return `/hotels/${destination.destination}/${destination.hotelSlug}?${params}`;
  }
  // Free text can be a hotel name. Keep it as a name filter instead of treating it as a city slug.
  if (destination.type === 'TEXT' && destination.name) params.set('name', destination.name);
  // A city/area — go to HotelsPage with destination as query param
  if (destination.type === 'AREA' && destination.area) params.set('area', destination.area);
  if (destination.destination) params.set('destination', destination.destination);
  return `/hotels?${params}`;
}

/**
 * The search form used on the homepage (hero) and in the results header (compact). The same component, so
 * the rules are the same everywhere: a valid stay, a destination, and a per-room occupancy.
 */
export function SearchWidget({ variant = 'hero', initial, onSubmitted, onSearch }) {
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
    if (!target && typed.trim()) target = { type: 'TEXT', label: typed.trim(), name: typed.trim() };
    if (!target?.destination && !target?.name) {
      setError('Choose where you are going');
      return;
    }
    setError(null);
    if (onSearch) {
      onSearch({
        destination: target.destination ?? null,
        area: target.type === 'AREA' ? target.area : null,
        hotelSlug: target.type === 'HOTEL' ? target.hotelSlug : null,
        name: target.type === 'TEXT' ? target.name : target.type === 'HOTEL' ? target.label : null,
        label: target.label,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        occupancy,
        coupon: initial?.coupon ?? null,
      });
      onSubmitted?.();
      return;
    }
    navigate(searchTargetFor(target, stay, occupancy, initial?.coupon));
    onSubmitted?.();
  };

  const compact = variant === 'compact';

  const dateRange = (
    <DateRangePicker
      idPrefix={variant}
      min={today}
      checkIn={stay.checkIn}
      checkOut={stay.checkOut}
      bare={!compact}
      onChange={({ checkIn, checkOut }) => {
        setError(null);
        setStay((current) => ({
          checkIn: checkIn ?? current.checkIn,
          checkOut: checkOut ?? (checkIn ? null : current.checkOut),
        }));
      }}
    />
  );

  if (compact) {
    return (
      <form onSubmit={submit} noValidate aria-label="Search hotels" className="customer-compact-search grid w-full grid-cols-1 gap-2.5 md:grid-cols-[1.6fr_1.6fr_1.2fr_auto] md:items-center">
        <DestinationField value={destination} onChange={setDestination} onTextChange={setTyped} />
        {dateRange}
        <GuestsPopover idPrefix={variant} rooms={occupancy} onChange={setOccupancy} />
        <Button type="submit" size="lg" className="w-full">
          <Search className="h-4 w-4" aria-hidden="true" /> Search Hotels
        </Button>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger-600 md:col-span-4">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <form onSubmit={submit} noValidate aria-label="Search hotels" className="customer-search-widget w-full rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-card)] p-1.5 shadow-sm">
      <div className="grid grid-cols-1 divide-y divide-[var(--border-subtle)] lg:grid-cols-[1.5fr_1.4fr_1fr_auto] lg:items-stretch lg:divide-x lg:divide-y-0">
        <DestinationField value={destination} onChange={setDestination} onTextChange={setTyped} bare />
        {dateRange}
        <GuestsPopover
          idPrefix={variant}
          rooms={occupancy}
          onChange={setOccupancy}
          stayNights={nightsBetween(stay.checkIn, stay.checkOut)}
          bare
        />
        <div className="customer-search-submit flex items-center p-1.5 lg:pl-3">
          <Button type="submit" size="lg" className="h-14 w-full">
            Search
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="px-3 pb-1 pt-2 text-sm text-danger-600">
          {error}
        </p>
      )}
    </form>
  );
}
