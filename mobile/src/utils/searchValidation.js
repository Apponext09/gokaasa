import { todayIso } from './format.js';

/** The one gate between a search form and ever calling the real search API -- shared by HomeScreen's
 * search card and SearchScreen, so "what counts as a valid search" is defined exactly once. */
export function validateSearchCriteria(destination, checkIn, checkOut) {
  if (!destination?.destination) return 'Choose a destination to search.';
  if (!checkIn || !checkOut) return 'Choose your check-in and check-out dates.';
  if (checkOut <= checkIn) return 'Check-out must be after check-in.';
  if (checkIn < todayIso()) return "Check-in can't be in the past.";
  return null;
}
