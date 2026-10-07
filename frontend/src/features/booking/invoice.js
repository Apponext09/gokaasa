import { bookingApi } from '@/services/endpoints.js';

/**
 * Downloads the server-generated PDF invoice for a booking. The PDF is rendered on the server from the
 * booking's own stored snapshot (never recomputed from today's rates), so nothing here can be tampered
 * with by editing the page -- this call only triggers the save, it does not build the document.
 */
export async function downloadInvoice(booking) {
  const blob = await bookingApi.invoiceBlob(booking.id);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${booking.bookingRef}-invoice.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
