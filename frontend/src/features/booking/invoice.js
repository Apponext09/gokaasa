import { formatMoneyMinor, formatStayDate } from './bookingFormat.js';

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/**
 * A simple invoice built only from the booking snapshot the server returned. It is a document for the guest's
 * records, not a tax invoice; the GST number and company name are shown exactly as the guest entered them.
 */
export function buildInvoiceHtml(booking) {
  const money = (minor) => escapeHtml(formatMoneyMinor(minor, booking.amounts.currency));
  const rows = booking.rooms
    .map(
      (room) => `<tr><td>${escapeHtml(room.name)} · ${escapeHtml(room.ratePlanName)}<br><small>${room.quantity} room(s), ${room.nights} night(s)</small></td><td class="num">${money(room.totalMinor)}</td></tr>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Invoice ${escapeHtml(booking.bookingRef)}</title>
<style>body{font-family:system-ui,sans-serif;color:#111;max-width:720px;margin:32px auto;padding:0 16px}
h1{font-size:20px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}td{padding:8px 0;border-bottom:1px solid #e5e7eb;vertical-align:top}
.num{text-align:right;white-space:nowrap}.total td{font-weight:700;border-bottom:none}small{color:#555}</style></head>
<body>
<h1>Gokaasa booking invoice</h1>
<p>Booking reference <strong>${escapeHtml(booking.bookingRef)}</strong> · Status ${escapeHtml(booking.status)}</p>
<p><strong>${escapeHtml(booking.hotel.name)}</strong><br>${escapeHtml(booking.hotel.address)}</p>
<p>${escapeHtml(formatStayDate(booking.stay.checkIn))} → ${escapeHtml(formatStayDate(booking.stay.checkOut))} · ${booking.stay.nights} night(s)</p>
<p>Billed to ${escapeHtml(booking.primaryContact.firstName)} ${escapeHtml(booking.primaryContact.lastName)}${booking.companyName ? `, ${escapeHtml(booking.companyName)}` : ''}${booking.gstNumber ? `<br>GSTIN ${escapeHtml(booking.gstNumber)}` : ''}</p>
<table>${rows}
<tr><td>Subtotal</td><td class="num">${money(booking.amounts.subtotal)}</td></tr>
${booking.amounts.discount ? `<tr><td>Discount</td><td class="num">−${money(booking.amounts.discount)}</td></tr>` : ''}
<tr><td>Taxes</td><td class="num">${money(booking.amounts.taxes)}</td></tr>
<tr><td>Fees</td><td class="num">${money(booking.amounts.fees)}</td></tr>
<tr class="total"><td>Total</td><td class="num">${money(booking.amounts.total)}</td></tr>
<tr><td>Paid</td><td class="num">${money(booking.amounts.paid)}</td></tr>
${booking.amounts.refunded ? `<tr><td>Refunded</td><td class="num">${money(booking.amounts.refunded)}</td></tr>` : ''}
</table>
<p><small>Payment ID ${escapeHtml(booking.payment?.id ?? '—')}. Cancellation: ${escapeHtml(booking.cancellation.description ?? '')}</small></p>
</body></html>`;
}

/** Saves the invoice as a file in the browser. Nothing is sent anywhere. */
export function downloadInvoice(booking) {
  const blob = new Blob([buildInvoiceHtml(booking)], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${booking.bookingRef}-invoice.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
