import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { addDaysIso, nightsBetween, summarizeOccupancy, todayIso } from '../utils/format.js';
import { OCCUPANCY_LIMITS } from '../constants/booking.js';

const STORAGE_KEY = '@gokaasa_booking_search';

const DEFAULT_ROOMS = [{ adults: 2, childAges: [] }];

function getInitialDates() {
  const today = todayIso();
  return {
    checkIn: addDaysIso(today, 1),
    checkOut: addDaysIso(today, 2),
  };
}

const defaultDates = getInitialDates();

export const DEFAULT_SEARCH_STATE = {
  destination: null,
  checkIn: defaultDates.checkIn,
  checkOut: defaultDates.checkOut,
  rooms: DEFAULT_ROOMS,
};

const BookingSearchContext = createContext(null);

export function BookingSearchProvider({ children }) {
  const [destination, setDestinationState] = useState(DEFAULT_SEARCH_STATE.destination);
  const [checkIn, setCheckInState] = useState(DEFAULT_SEARCH_STATE.checkIn);
  const [checkOut, setCheckOutState] = useState(DEFAULT_SEARCH_STATE.checkOut);
  const [rooms, setRoomsState] = useState(DEFAULT_SEARCH_STATE.rooms);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from AsyncStorage on startup
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) {
          setHydrated(true);
          return;
        }
        try {
          const parsed = JSON.parse(raw);
          const today = todayIso();

          // Only persist stay dates and rooms across sessions -- browsing starts with All Properties unless user explicitly chooses a place
          if (parsed.destination) {
            // Clear any legacy persisted destination from storage
            AsyncStorage.mergeItem(STORAGE_KEY, JSON.stringify({ destination: null })).catch(() => {});
          }

          // If cached check-in is in the future/today, preserve it; otherwise use tomorrow
          if (parsed.checkIn && parsed.checkIn >= today && parsed.checkOut && parsed.checkOut > parsed.checkIn) {
            setCheckInState(parsed.checkIn);
            setCheckOutState(parsed.checkOut);
          } else {
            const fresh = getInitialDates();
            setCheckInState(fresh.checkIn);
            setCheckOutState(fresh.checkOut);
          }

          if (Array.isArray(parsed.rooms) && parsed.rooms.length > 0) {
            // Validate room structure & limits
            const validRooms = parsed.rooms.slice(0, OCCUPANCY_LIMITS.maxRooms).map((r) => ({
              adults: Math.max(OCCUPANCY_LIMITS.minAdults, Math.min(OCCUPANCY_LIMITS.maxAdults, r.adults || 2)),
              childAges: Array.isArray(r.childAges)
                ? r.childAges
                    .slice(0, OCCUPANCY_LIMITS.maxChildrenPerRoom)
                    .map((age) => Math.max(OCCUPANCY_LIMITS.minAge, Math.min(OCCUPANCY_LIMITS.maxAge, Number(age) || 10)))
                : [],
            }));
            setRoomsState(validRooms);
          }
        } catch {
          // Ignore parse errors and use default state
        } finally {
          setHydrated(true);
        }
      })
      .catch(() => setHydrated(true));
  }, []);

  // Save changes to AsyncStorage (dates and rooms only -- destination is session-scoped)
  const persistState = useCallback((nextState) => {
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        destination: null,
        checkIn: nextState.checkIn,
        checkOut: nextState.checkOut,
        rooms: nextState.rooms,
      })
    ).catch(() => {});
  }, []);

  const setDestination = useCallback((dest) => {
    setDestinationState(dest);
  }, []);

  const setDates = useCallback(
    (newCheckIn, newCheckOut) => {
      setCheckInState(newCheckIn);
      setCheckOutState(newCheckOut);
      persistState({ destination, checkIn: newCheckIn, checkOut: newCheckOut, rooms });
    },
    [destination, rooms, persistState]
  );

  const setRooms = useCallback(
    (newRooms) => {
      const sanitized = Array.isArray(newRooms) && newRooms.length > 0 ? newRooms : DEFAULT_ROOMS;
      setRoomsState(sanitized);
      persistState({ destination, checkIn, checkOut, rooms: sanitized });
    },
    [destination, checkIn, checkOut, persistState]
  );

  const setStay = useCallback(
    (patch) => {
      const nextDestination = patch.destination !== undefined ? patch.destination : destination;
      const nextCheckIn = patch.checkIn || checkIn;
      const nextCheckOut = patch.checkOut || checkOut;
      const nextRooms = Array.isArray(patch.rooms) && patch.rooms.length > 0 ? patch.rooms : (Array.isArray(patch.occupancy) && patch.occupancy.length > 0 ? patch.occupancy : rooms);

      setDestinationState(nextDestination);
      setCheckInState(nextCheckIn);
      setCheckOutState(nextCheckOut);
      setRoomsState(nextRooms);

      persistState({
        destination: nextDestination,
        checkIn: nextCheckIn,
        checkOut: nextCheckOut,
        rooms: nextRooms,
      });
    },
    [destination, checkIn, checkOut, rooms, persistState]
  );

  const resetStay = useCallback(() => {
    const freshDates = getInitialDates();
    setDestinationState(null);
    setCheckInState(freshDates.checkIn);
    setCheckOutState(freshDates.checkOut);
    setRoomsState(DEFAULT_ROOMS);
    persistState({
      destination: null,
      checkIn: freshDates.checkIn,
      checkOut: freshDates.checkOut,
      rooms: DEFAULT_ROOMS,
    });
  }, [persistState]);

  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);
  const summaryLabel = useMemo(() => summarizeOccupancy(rooms), [rooms]);

  const value = useMemo(
    () => ({
      destination,
      setDestination,
      checkIn,
      checkOut,
      setDates,
      rooms,
      occupancy: rooms,
      setRooms,
      setStay,
      resetStay,
      nights,
      summaryLabel,
      hydrated,
    }),
    [destination, setDestination, checkIn, checkOut, setDates, rooms, setRooms, setStay, resetStay, nights, summaryLabel, hydrated]
  );

  return <BookingSearchContext.Provider value={value}>{children}</BookingSearchContext.Provider>;
}

export function useBookingSearch() {
  const context = useContext(BookingSearchContext);
  if (!context) {
    const fallbackDates = getInitialDates();
    return {
      destination: null,
      setDestination: () => {},
      checkIn: fallbackDates.checkIn,
      checkOut: fallbackDates.checkOut,
      setDates: () => {},
      rooms: DEFAULT_ROOMS,
      occupancy: DEFAULT_ROOMS,
      setRooms: () => {},
      setStay: () => {},
      resetStay: () => {},
      nights: 1,
      summaryLabel: '1 Room · 2 Adults',
      hydrated: true,
    };
  }
  return context;
}
