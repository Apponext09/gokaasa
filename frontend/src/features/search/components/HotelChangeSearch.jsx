import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button.jsx';
import { DestinationField } from '@/features/search/components/DestinationField.jsx';
import { DateRangePicker } from '@/features/search/components/DateRangePicker.jsx';
import { GuestsPopover } from '@/features/search/components/GuestsPopover.jsx';
import {
  todayIso,
  validateStay,
  nightsBetween,
  stayParams,
} from '@/features/search/searchParams.js';
import { cn } from '@/lib/utils.js';

const titleCase = (slug) =>
  slug ? slug.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ') : '';

function destinationObjFor(initial) {
  if (!initial) return null;
  if (typeof initial === 'object' && initial.label) return initial;

  const destStr = initial.destination || (typeof initial === 'string' ? initial : null);
  const nameStr = initial.name || null;
  const areaStr = initial.area || null;

  if (nameStr) {
    return {
      type: 'TEXT',
      label: nameStr,
      name: nameStr,
      destination: destStr,
      area: areaStr,
    };
  }

  if (areaStr) {
    return {
      type: 'AREA',
      label: titleCase(areaStr),
      destination: destStr,
      area: areaStr,
    };
  }

  if (destStr) {
    return {
      type: 'CITY',
      label: titleCase(destStr),
      destination: destStr,
      area: null,
    };
  }

  return null;
}

export function HotelChangeSearch({
  idPrefix = 'hotel-change',
  initialDestination = null,
  initialStay = null,
  initialOccupancy = null,
  coupon = null,
  onSearch = null,
  className = '',
}) {
  const navigate = useNavigate();
  const today = todayIso();

  const [destination, setDestination] = useState(() => destinationObjFor(initialDestination));
  const [stay, setStay] = useState(() => ({
    checkIn: initialStay?.checkIn ?? null,
    checkOut: initialStay?.checkOut ?? null,
  }));
  const [occupancy, setOccupancy] = useState(
    () => initialOccupancy ?? [{ adults: 2, childAges: [] }]
  );

  useEffect(() => {
    setDestination(destinationObjFor(initialDestination));
  }, [initialDestination]);

  useEffect(() => {
    setStay({
      checkIn: initialStay?.checkIn ?? null,
      checkOut: initialStay?.checkOut ?? null,
    });
  }, [initialStay?.checkIn, initialStay?.checkOut]);

  useEffect(() => {
    if (initialOccupancy) setOccupancy(initialOccupancy);
  }, [initialOccupancy]);

  const handleSubmit = (event) => {
    event?.preventDefault();
    if (stay.checkIn || stay.checkOut) {
      if (validateStay(stay, today)) return;
    }

    if (onSearch) {
      onSearch({
        destination: destination?.destination ?? null,
        area: destination?.area ?? null,
        hotelSlug: destination?.type === 'HOTEL' ? destination.hotelSlug : null,
        name: destination?.type === 'HOTEL' ? destination.label : (destination?.name || destination?.label || null),
        label: destination?.label ?? null,
        checkIn: stay.checkIn,
        checkOut: stay.checkOut,
        occupancy,
        coupon,
      });
      return;
    }

    const nextParams = stayParams({
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      occupancy,
      coupon,
    });
    if (destination?.destination) nextParams.set('destination', destination.destination);
    if (destination?.area) nextParams.set('area', destination.area);

    if (destination?.type === 'HOTEL' && destination?.hotelSlug) {
      navigate(`/hotels/${destination.destination}/${destination.hotelSlug}?${nextParams.toString()}`);
      return;
    }
    navigate(`/hotels?${nextParams.toString()}`);
  };

  return (
    <form className={cn('hotel-change-search', className)} onSubmit={handleSubmit} aria-label="Change hotel search">
      <DestinationField
        id={`${idPrefix}-destination`}
        value={destination}
        onChange={setDestination}
        bare
      />
      <DateRangePicker
        idPrefix={`${idPrefix}-dates`}
        min={today}
        checkIn={stay.checkIn}
        checkOut={stay.checkOut}
        onChange={({ checkIn, checkOut }) => setStay((curr) => ({ ...curr, checkIn, checkOut }))}
        bare
      />
      <GuestsPopover
        idPrefix={`${idPrefix}-guests`}
        rooms={occupancy}
        onChange={setOccupancy}
        stayNights={nightsBetween(stay.checkIn, stay.checkOut)}
        bare
      />
      <Button type="submit">
        <Search className="h-4 w-4" aria-hidden="true" /> Search
      </Button>
    </form>
  );
}
