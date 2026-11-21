import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, Calendar, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button.jsx';
import { DateRangePicker } from '@/features/search/components/DateRangePicker.jsx';
import { GuestsPopover } from '@/features/search/components/GuestsPopover.jsx';
import { todayIso, nightsBetween } from '@/features/search/searchParams.js';
import { saveSelection, readSelection } from '@/features/booking/selection.js';
import { bookingApi } from '@/services/endpoints.js';
import { normalizeError } from '@/services/api.js';

/**
 * Reusable top stay search/update bar for reservations.
 * Works seamlessly for both normal bookings and Quick Reserve.
 * Displayed at the top of both Guest Details and Booking Review pages.
 * Allows updating check-in, check-out, and occupancy dynamically with live re-pricing and re-holding.
 */
export function BookingStayBar({ hold, onHoldUpdated, className = '' }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const today = todayIso();

  const stay = hold?.quote?.stay;
  const initialCheckIn = stay?.checkIn || today;
  const initialCheckOut = stay?.checkOut || '';
  const initialOccupancy = stay?.occupancy || [{ adults: 2, childAges: [], pets: 0 }];

  const [checkIn, setCheckIn] = useState(initialCheckIn);
  const [checkOut, setCheckOut] = useState(initialCheckOut);
  const [occupancy, setOccupancy] = useState(initialOccupancy);

  const [activeDropdown, setActiveDropdown] = useState(null); // 'checkin' | 'checkout' | 'guests' | null
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState(null);

  // Sync state if hold changes from external reload
  useEffect(() => {
    if (stay?.checkIn) setCheckIn(stay.checkIn);
    if (stay?.checkOut) setCheckOut(stay.checkOut);
    if (stay?.occupancy) setOccupancy(stay.occupancy);
  }, [stay?.checkIn, stay?.checkOut, stay?.occupancy]);

  const handleDatesChange = ({ checkIn: nextCheckIn, checkOut: nextCheckOut }) => {
    setError(null);
    setCheckIn(nextCheckIn);
    setCheckOut(nextCheckOut);
  };

  const handleGuestsChange = (nextOccupancy) => {
    setError(null);
    setOccupancy(nextOccupancy);
  };

  const handleUpdate = async (e) => {
    if (e) e.preventDefault();
    setError(null);

    // Validation
    if (!checkIn || !checkOut) {
      setError('Please select both check-in and check-out dates.');
      return;
    }

    if (checkIn < today) {
      setError('Check-in date cannot be in the past.');
      return;
    }

    if (checkOut <= checkIn) {
      setError('Check-out date must be after check-in.');
      return;
    }

    const currentCheckIn = stay?.checkIn;
    const currentCheckOut = stay?.checkOut;
    const currentOccupancyStr = JSON.stringify(stay?.occupancy || []);
    const nextOccupancyStr = JSON.stringify(occupancy || []);

    if (checkIn === currentCheckIn && checkOut === currentCheckOut && currentOccupancyStr === nextOccupancyStr) {
      toast.info('Dates and guests are already set to these values.');
      return;
    }

    setUpdating(true);
    try {
      const quote = hold?.quote;
      const hotelId = quote?.hotel?.id;
      const roomTypeId = quote?.room?.id;
      const ratePlanId = quote?.ratePlan?.id;
      const totalPets = (occupancy || []).reduce((sum, r) => sum + (r.pets || 0), 0);
      const isQuickReserve = params.get('quickReserve') === 'true' || Boolean(readSelection()?.quickReserve);

      // 1. Create a new hold for the updated dates & occupancy
      const newHold = await bookingApi.createHold({
        hotelId,
        roomTypeId,
        ratePlanId,
        checkIn,
        checkOut,
        rooms: occupancy.length,
        occupancy,
        petsCount: totalPets,
      });

      // 2. Release previous hold
      if (hold?.id) {
        bookingApi.release(hold.id).catch(() => {});
      }

      // 3. Preserve guest contact & details if already entered on previous hold
      if (hold?.guestDetails) {
        try {
          await bookingApi.saveGuests(newHold.id, hold.guestDetails);
        } catch {
          // If occupancy structure changed, guest details can be reviewed on form
        }
      }

      // 4. Save to shared reservation state (sessionStorage)
      const existingSelection = readSelection() || {};
      saveSelection({
        ...existingSelection,
        hotelId,
        roomTypeId,
        ratePlanId,
        checkIn,
        checkOut,
        rooms: occupancy.length,
        occupancy,
        petsCount: totalPets,
        ...(isQuickReserve ? { quickReserve: true } : {}),
      });

      // 5. Update URL params to sync holdId while keeping quickReserve if applicable
      const nextParams = new URLSearchParams(params);
      nextParams.set('holdId', String(newHold.id));
      if (isQuickReserve) {
        nextParams.set('quickReserve', 'true');
      }
      setParams(nextParams, { replace: true });

      // 6. Notify parent component to update state and price breakdown
      if (onHoldUpdated) {
        onHoldUpdated(newHold);
      }

      toast.success('Reservation dates updated successfully.');
    } catch (err) {
      const normalized = normalizeError(err);
      if (normalized.status === 409) {
        setError('This room is unavailable for the selected dates. Please choose different dates.');
      } else {
        setError(normalized.message || 'Unable to update reservation dates. Please try again.');
      }
    } finally {
      setUpdating(false);
    }
  };

  const nights = checkIn && checkOut && checkOut > checkIn ? nightsBetween(checkIn, checkOut) : 0;

  return (
    <div
      className={`booking-stay-bar mb-6 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-sm transition-all md:sticky md:top-16 md:z-30 ${className}`}
      role="region"
      aria-label="Stay dates and guests"
    >
      <div className="flex flex-col gap-2.5">
        {/* Header: Clean, neutral stay details for both normal and quick reserve bookings */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-brand-600" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Stay Details
            </span>
          </div>
          {nights > 0 && (
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
              {nights} {nights === 1 ? 'night' : 'nights'} stay
            </span>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div className="flex-1 font-medium">{error}</div>
          </div>
        )}

        {/* Controls row: perfectly aligned and matched in height */}
        <form onSubmit={handleUpdate} className="grid grid-cols-1 gap-2.5 sm:grid-cols-[1.55fr_1.25fr_auto] items-stretch">
          {/* Dates picker */}
          <div className="min-w-0">
            <DateRangePicker
              idPrefix="stay"
              min={today}
              checkIn={checkIn}
              checkOut={checkOut}
              bare={true}
              disabled={updating}
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
              onChange={handleDatesChange}
              onComplete={({ checkIn: cIn, checkOut: cOut }) => {
                handleDatesChange({ checkIn: cIn, checkOut: cOut });
                setActiveDropdown(null);
              }}
            />
          </div>

          {/* Occupancy picker */}
          <div className="min-w-0">
            <GuestsPopover
              idPrefix="stay-guests"
              rooms={occupancy}
              bare={true}
              stayNights={nights}
              disabled={updating}
              isOpen={activeDropdown === 'guests'}
              onOpenChange={(isOpen) => setActiveDropdown(isOpen ? 'guests' : null)}
              onChange={handleGuestsChange}
              onComplete={() => setActiveDropdown(null)}
            />
          </div>

          {/* Update Button */}
          <Button
            type="submit"
            disabled={updating}
            className="h-full min-h-[60px] w-full rounded-xl px-7 text-sm font-bold shadow-sm transition-all hover:shadow-md sm:w-auto"
          >
            {updating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating…
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Update
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}

// Aliases for seamless backward compatibility and semantic clarity
export const StaySearchBar = BookingStayBar;
export const QuickReserveSearchBar = BookingStayBar;
