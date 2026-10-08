/** RFC 4180 field escaping: quote anything containing a comma, quote or newline; double up inner quotes. */
function escapeCsvField(value) {
  const text = value == null ? '' : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/**
 * Builds a CSV string server-side from already-fetched rows. `columns` is `[{ key, header }]`; `key` may
 * be a dotted path (e.g. "hotel.name") into each row. Row counts for admin exports are capped by the
 * caller before this runs -- this function just formats whatever it is given.
 */
export function toCsv(rows, columns) {
  const get = (row, key) => key.split('.').reduce((value, part) => value?.[part], row);
  const header = columns.map((col) => escapeCsvField(col.header)).join(',');
  const lines = rows.map((row) => columns.map((col) => escapeCsvField(get(row, col.key))).join(','));
  return [header, ...lines].join('\r\n') + '\r\n';
}

/** The one place every CSV-export controller route sends its response, so the headers are always identical. */
export function sendCsv(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  return res.send(csv);
}
