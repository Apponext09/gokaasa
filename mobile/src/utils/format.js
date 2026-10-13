/** Display helpers. Dates are calendar days, formatted in UTC to avoid a day shift -- mirrors the
 * website's bookingFormat.js exactly, since the backend hands both clients the same ISO date strings. */

export function formatStayDate(iso, options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { ...options, timeZone: 'UTC' });
}

/** Every price in the backend is an integer in minor units (paise) -- never a float, never recomputed here. */
export function formatMoneyMinor(minor, currency = 'INR') {
  if (minor == null) return '';
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(minor) / 100);
}

export function formatCountdown(seconds) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  return `${String(minutes).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function occupancyLabel(occupancy = []) {
  const adults = occupancy.reduce((sum, room) => sum + room.adults, 0);
  const children = occupancy.reduce((sum, room) => sum + room.childAges.length, 0);
  const rooms = occupancy.length;
  return `${rooms} room${rooms === 1 ? '' : 's'} · ${adults} adult${adults === 1 ? '' : 's'}${children ? ` · ${children} child${children === 1 ? '' : 'ren'}` : ''}`;
}

/** Rooms separated by "|"; each room is "<adults>" optionally followed by "-<age>.<age>..." -- the exact
 * shareable URL form backend/src/domain/occupancy.js parses on the server. */
export function formatOccupancy(rooms) {
  return rooms.map((room) => `${room.adults}${room.childAges.length ? `-${room.childAges.join('.')}` : ''}`).join('|');
}

/** Reconstructs each room's occupancy from a booking's own guest list (age < 18 counts as a child). */
export function occupancyFromGuests(guests = []) {
  const rooms = new Map();
  for (const guest of guests) {
    const room = rooms.get(guest.roomIndex) ?? { adults: 0, childAges: [] };
    if (guest.age < 18) room.childAges.push(guest.age);
    else room.adults += 1;
    rooms.set(guest.roomIndex, room);
  }
  return [...rooms.entries()].sort(([a], [b]) => a - b).map(([, room]) => room);
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysIso(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  return Math.round((new Date(`${checkOut}T00:00:00Z`) - new Date(`${checkIn}T00:00:00Z`)) / 86_400_000);
}
