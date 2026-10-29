/** Converts a stored 24-hour hotel time (for example 13:00) into a guest-friendly 12-hour label. */
export function formatTime12Hour(value) {
  if (!value) return '—';
  const match = String(value).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(value);
  const hour = Number(match[1]);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return String(value);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}
