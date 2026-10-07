/**
 * Calendar dates in a named time zone. The server never uses the UTC date as "today": at 20:00 UTC on
 * 9 October a guest in Mumbai is already booking for 10 October. Dates stay plain YYYY-MM-DD strings.
 *
 * Each hotel has its own `time_zone`; search and booking fall back to BUSINESS_TIMEZONE.
 */

const formatters = new Map();

function formatterFor(timeZone) {
  if (!formatters.has(timeZone)) {
    formatters.set(
      timeZone,
      new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      }),
    );
  }
  return formatters.get(timeZone);
}

/** Throws a RangeError for an unknown IANA zone name. Used to validate configuration and hotel data. */
export function assertTimeZone(timeZone) {
  formatterFor(timeZone);
  return timeZone;
}

function zonedParts(instant, timeZone) {
  const parts = {};
  for (const part of formatterFor(timeZone).formatToParts(instant)) parts[part.type] = part.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

/** The calendar date (YYYY-MM-DD) in `timeZone` at `instant`. */
export function localToday(timeZone, instant = new Date()) {
  const { year, month, day } = zonedParts(instant, timeZone);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * The UTC instant of a wall-clock time (`HH:MM`) on a calendar date in `timeZone`. Two passes correct for
 * the zone offset, which is stable for the zones used here (no DST jumps at the requested minute).
 */
export function zonedTimeToInstant(dateIso, hhmm, timeZone) {
  const [year, month, day] = dateIso.split('-').map(Number);
  const [hour, minute] = hhmm.split(':').map(Number);
  const naive = Date.UTC(year, month - 1, day, hour, minute);
  const shown = zonedParts(new Date(naive), timeZone);
  const shownAsUtc = Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
  return new Date(naive - (shownAsUtc - naive));
}
