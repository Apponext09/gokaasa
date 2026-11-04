import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';

import { Button } from '@/components/ui/button.jsx';
import { DestinationField } from '@/features/search/components/DestinationField.jsx';
import { DateRangePicker } from '@/features/search/components/DateRangePicker.jsx';
import { GuestsPopover } from '@/features/search/components/GuestsPopover.jsx';

import {
  addDays,
  nightsBetween,
  stayParams,
  todayIso,
  validateStay,
} from '@/features/search/searchParams.js';

const titleCase = (slug) =>
  slug.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ');

function initialDestinationFor(initial) {
  if (initial?.name) {
    return {
      type: 'TEXT',
      label: initial.name,
      name: initial.name,
      destination: initial.destination ?? null,
      area: initial.area ?? null,
    };
  }

  if (initial?.area) {
    return {
      type: 'AREA',
      label: titleCase(initial.area),
      destination: initial.destination ?? null,
      area: initial.area,
    };
  }

  if (initial?.destination) {
    return {
      type: 'CITY',
      label: titleCase(initial.destination),
      destination: initial.destination,
      area: null,
    };
  }

  return null;
}

function searchTargetFor(destination, stay, occupancy, coupon = null) {
  const params = stayParams({ ...stay, occupancy, coupon });

  if (destination.type === 'HOTEL' && destination.hotelSlug) {
    return `/hotels/${destination.destination}/${destination.hotelSlug}?${params}`;
  }

  if (destination.type === 'TEXT' && destination.name) {
    params.set('name', destination.name);
  }

  if (destination.area) params.set('area', destination.area);
  if (destination.destination) params.set('destination', destination.destination);

  return `/hotels?${params}`;
}

export function SearchWidget({
  variant = 'hero',
  initial,
  onSubmitted,
  onSearch,
}) {
  const navigate = useNavigate();
  const today = todayIso();
  const widgetRef = useRef(null);

  // Expected Sequence: area -> checkin -> checkout -> guests
  const [activeDropdown, setActiveDropdown] = useState(null); // 'area' | 'checkin' | 'checkout' | 'guests' | null
  const [pendingStep, setPendingStep] = useState(null);

  const [destination, setDestination] = useState(
    () => initialDestinationFor(initial)
  );

  const [typed, setTyped] = useState(initial?.name ?? '');

  const [stay, setStay] = useState({
    checkIn: initial?.checkIn ?? null,
    checkOut: initial?.checkOut ?? null,
  });

  const [occupancy, setOccupancy] = useState(
    initial?.occupancy ?? null
  );

  const [error, setError] = useState(null);

  // Close active dropdown on outside click or Escape
  useEffect(() => {
    if (!activeDropdown) return undefined;

    const handlePointerDown = (event) => {
      if (widgetRef.current && !widgetRef.current.contains(event.target)) {
        setActiveDropdown(null);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setActiveDropdown(null);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [activeDropdown]);

  // Reliable transition: update destination state first, then open Check-in Date picker via useEffect
  const handleDestinationChange = (value) => {
    setDestination(value);
    setError(null);
    if (value) {
      setPendingStep('checkin');
    } else {
      setActiveDropdown(null);
    }
  };

  useEffect(() => {
    if (pendingStep) {
      setActiveDropdown(pendingStep);
      setPendingStep(null);
    }
  }, [pendingStep, destination]);

  const handleDatesChange = ({ checkIn, checkOut }) => {
    setError(null);
    setStay((current) => {
      const nextCheckIn = checkIn ?? current.checkIn;
      let nextCheckOut = checkOut ?? (checkIn ? null : current.checkOut);
      if (nextCheckIn && nextCheckOut && nextCheckOut <= nextCheckIn) {
        nextCheckOut = null;
      }
      return {
        checkIn: nextCheckIn,
        checkOut: nextCheckOut,
      };
    });
  };

  const handleCheckInSelect = () => {
    // Step 2 -> Step 3: Check-in selected -> auto open Check-out
    setActiveDropdown('checkout');
  };

  const handleCheckOutSelect = () => {
    // Step 3 -> Step 4: Check-out selected -> auto open Rooms & Guests
    setActiveDropdown('guests');
  };

  const handleGuestsComplete = () => {
    // Step 4 completed: Close dropdown
    setActiveDropdown(null);
  };

  const submit = (event) => {
    event?.preventDefault();

    if (stay.checkIn || stay.checkOut) {
      const stayProblem = validateStay(stay, today);
      if (stayProblem) {
        setError(stayProblem);
        return;
      }
    }

    let target = destination;

    if (!target && typed.trim()) {
      target = {
        type: 'TEXT',
        label: typed.trim(),
        name: typed.trim(),
      };
    }

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
        name:
          target.type === 'TEXT'
            ? target.name
            : target.type === 'HOTEL'
              ? target.label
              : null,
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
      isOpen={activeDropdown === 'checkin' || activeDropdown === 'checkout'}
      activeTarget={activeDropdown === 'checkout' ? 'checkOut' : 'checkIn'}
      onTargetChange={(target) => {
        setActiveDropdown((current) => {
          if (current === 'checkin' || current === 'checkout') {
            return target === 'checkOut' ? 'checkout' : 'checkin';
          }
          return current;
        });
      }}
      onCheckInClick={() => setActiveDropdown('checkin')}
      onCheckOutClick={() => setActiveDropdown('checkout')}
      onOpenChange={(isOpen) => {
        if (!isOpen) setActiveDropdown(null);
      }}
      onCheckInSelect={handleCheckInSelect}
      onCheckOutSelect={handleCheckOutSelect}
      onChange={handleDatesChange}
      onComplete={handleCheckOutSelect}
    />
  );

  // COMPACT SEARCH
  if (compact) {
    return (
      <form
        ref={widgetRef}
        onSubmit={submit}
        noValidate
        aria-label="Search hotels"
        className="
          customer-compact-search
          grid w-full grid-cols-1 gap-2.5
          rounded-2xl border border-slate-200/80
          bg-white p-3
          shadow-[0_5px_20px_rgba(20,36,59,0.07)]
          transition-shadow duration-300
          hover:shadow-[0_8px_26px_rgba(20,36,59,0.10)]
          md:grid-cols-[1.6fr_1.6fr_1.2fr_auto]
          md:items-center
        "
      >
        <div className="min-w-0 rounded-xl border border-slate-100 bg-[#FAFBFD] px-3 py-2 transition-colors duration-200 focus-within:border-[#D9B66F] focus-within:bg-white">
          <DestinationField
            id={`destination-${variant}`}
            value={destination}
            isOpen={activeDropdown === 'area'}
            onOpenChange={(isOpen) => setActiveDropdown(isOpen ? 'area' : null)}
            onChange={handleDestinationChange}
            onTextChange={setTyped}
          />
        </div>

        <div className="min-w-0 rounded-xl border border-slate-100 bg-[#FAFBFD] px-3 py-2 transition-colors duration-200 focus-within:border-[#D9B66F] focus-within:bg-white">
          {dateRange}
        </div>

        <div className="min-w-0 rounded-xl border border-slate-100 bg-[#FAFBFD] px-3 py-2 transition-colors duration-200 focus-within:border-[#D9B66F] focus-within:bg-white">
          <GuestsPopover
            idPrefix={variant}
            rooms={occupancy}
            isOpen={activeDropdown === 'guests'}
            onOpenChange={(isOpen) => setActiveDropdown(isOpen ? 'guests' : null)}
            onChange={setOccupancy}
            onComplete={handleGuestsComplete}
          />
        </div>

        <Button
          type="submit"
          size="lg"
          className="
            h-12 w-full rounded-xl
            border border-[#D9B66F]/30
            bg-gradient-to-r from-[#14243B] to-[#203B5C]
            font-semibold text-white
            shadow-[0_4px_12px_rgba(20,36,59,0.16)]
            transition-all duration-300
            hover:-translate-y-0.5
            hover:from-[#1C3555] hover:to-[#29486B]
            hover:shadow-[0_7px_18px_rgba(20,36,59,0.22)]
            active:translate-y-0
            focus-visible:outline-2
            focus-visible:outline-offset-2
            focus-visible:outline-[#D9B66F]
          "
        >
          <Search className="mr-1.5 h-4 w-4 text-[#E6CA94]" aria-hidden="true" />
          Search Hotels
        </Button>

        {error && (
          <p role="alert" className="mt-1 text-sm text-danger-600 md:col-span-4">
            {error}
          </p>
        )}
      </form>
    );
  }

  // SMALLER HERO SEARCH
  return (
    <form
      ref={widgetRef}
      onSubmit={submit}
      noValidate
      aria-label="Search hotels"
      className="
        customer-search-widget
        mx-auto w-full max-w-5xl
        rounded-2xl
        border border-slate-200/80
        bg-white p-1
        shadow-[0_8px_25px_rgba(20,36,59,0.10)]
        ring-1 ring-white/70
        transition-shadow duration-300
        hover:shadow-[0_12px_30px_rgba(20,36,59,0.13)]
      "
    >
      <div
        className="
          grid grid-cols-1
          divide-y divide-slate-100
          lg:grid-cols-[1.5fr_1.4fr_1fr_auto]
          lg:items-center
          lg:divide-x lg:divide-y-0
        "
      >
        {/* DESTINATION */}
        <div className="min-w-0 rounded-l-xl transition-colors duration-200 hover:bg-slate-50/60">
          <DestinationField
            id={`destination-${variant}`}
            value={destination}
            isOpen={activeDropdown === 'area'}
            onOpenChange={(isOpen) => setActiveDropdown(isOpen ? 'area' : null)}
            onChange={handleDestinationChange}
            onTextChange={setTyped}
            bare
          />
        </div>

        {/* DATE RANGE */}
        <div className="min-w-0 transition-colors duration-200 hover:bg-slate-50/60">
          {dateRange}
        </div>

        {/* GUESTS */}
        <div className="min-w-0 transition-colors duration-200 hover:bg-slate-50/60">
          <GuestsPopover
            idPrefix={variant}
            rooms={occupancy}
            isOpen={activeDropdown === 'guests'}
            onOpenChange={(isOpen) => setActiveDropdown(isOpen ? 'guests' : null)}
            onChange={setOccupancy}
            onComplete={handleGuestsComplete}
            stayNights={nightsBetween(stay.checkIn, stay.checkOut)}
            bare
          />
        </div>

        {/* SEARCH BUTTON */}
        <div className="customer-search-submit flex items-center p-1 lg:pl-2">
          <Button
            type="submit"
            size="lg"
            className="
              h-11 w-full rounded-lg
              border border-[#D9B66F]/30
              bg-gradient-to-r from-[#14243B] to-[#203B5C]
              px-5 text-sm font-semibold tracking-wide text-white
              shadow-[0_4px_10px_rgba(20,36,59,0.14)]
              transition-all duration-300
              hover:-translate-y-0.5
              hover:from-[#1C3555] hover:to-[#29486B]
              hover:shadow-[0_6px_15px_rgba(20,36,59,0.20)]
              active:translate-y-0
              focus-visible:outline-2
              focus-visible:outline-offset-2
              focus-visible:outline-[#D9B66F]
            "
          >
            <Search
              className="mr-1.5 h-4 w-4 text-[#E6CA94]"
              aria-hidden="true"
            />
            Search
          </Button>
        </div>
      </div>

      {/* VALIDATION MESSAGE */}
      {error && (
        <p
          role="alert"
          className="px-3 pb-1 pt-2 text-sm font-medium text-danger-600"
        >
          {error}
        </p>
      )}
    </form>
  );
}
