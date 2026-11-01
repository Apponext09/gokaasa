import PDFDocument from 'pdfkit';
import { bookingService } from './booking.service.js';
import { adminBookingService } from './adminBooking.service.js';

const NAVY = '#1e3a5f';
const INK = '#121a28';
const BODY = '#3b4452';
const MUTED = '#6f6a62';
const BORDER = '#e8e2d6';

const money = (minor, currency = 'INR') => {
  const amount = (Number(minor) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'INR' ? `${amount} Rs` : `${amount} ${currency}`;
};

/**
 * Renders one booking's invoice as a PDF, entirely server-side from the booking's own stored snapshot --
 * never from today's rates, and never from anything the browser could have supplied. Deliberately plain:
 * one page, Helvetica (bundled with pdfkit, no font files to ship), a navy/gold-adjacent accent rule.
 */
function renderInvoicePdf(booking) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.fillColor(NAVY).font('Helvetica-Bold').fontSize(22).text('GOKAASA', 50, 50);
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('support@gokaasa.com  ·  +91-9876543210', 50, 76);

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(16).text('INVOICE', 50, 50, { width: 495, align: 'right' });
  doc.fillColor(BODY).font('Helvetica').fontSize(9);
  doc.text(`Invoice / Booking ref: ${booking.bookingRef}`, 50, 74, { width: 495, align: 'right' });
  doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`, 50, 87, { width: 495, align: 'right' });
  doc.text(`Status: ${booking.status}`, 50, 100, { width: 495, align: 'right' });

  doc.moveTo(50, 118).lineTo(545, 118).lineWidth(1.5).strokeColor(NAVY).stroke();

  let leftY = 132;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text('Billed to', 50, leftY);
  doc.fillColor(BODY).font('Helvetica').fontSize(9);
  leftY += 15;
  doc.text(`${booking.primaryContact.firstName} ${booking.primaryContact.lastName}`, 50, leftY); leftY += 13;
  doc.text(booking.primaryContact.email, 50, leftY); leftY += 13;
  doc.text(booking.primaryContact.mobile, 50, leftY); leftY += 13;
  if (booking.companyName) { doc.text(booking.companyName, 50, leftY); leftY += 13; }
  if (booking.billingAddress) { doc.text(booking.billingAddress, 50, leftY, { width: 230 }); leftY += 26; }
  if (booking.gstNumber) { doc.text(`GSTIN: ${booking.gstNumber}`, 50, leftY); leftY += 13; }

  let rightY = 132;
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text('Stay details', 310, rightY);
  doc.fillColor(BODY).font('Helvetica').fontSize(9);
  rightY += 15;
  doc.text(booking.hotel.name, 310, rightY, { width: 235 }); rightY += 13;
  if (booking.hotel.address) { doc.text(booking.hotel.address, 310, rightY, { width: 235 }); rightY += 26; }
  doc.text(`Check-in: ${booking.stay.checkIn}`, 310, rightY); rightY += 13;
  doc.text(`Check-out: ${booking.stay.checkOut}`, 310, rightY); rightY += 13;
  doc.text(`${booking.stay.nights} night(s)  ·  ${booking.stay.rooms} room(s)  ·  ${booking.stay.adults} adult(s), ${booking.stay.children} child(ren)`, 310, rightY, { width: 235 }); rightY += 13;

  let y = Math.max(leftY, rightY) + 20;
  doc.rect(50, y, 495, 20).fill(NAVY);
  doc.fillColor('white').font('Helvetica-Bold').fontSize(9);
  doc.text('Room', 58, y + 6, { width: 150 });
  doc.text('Meal plan', 210, y + 6, { width: 100 });
  doc.text('Qty', 315, y + 6, { width: 40 });
  doc.text('Nights', 360, y + 6, { width: 40 });
  doc.text('Amount', 440, y + 6, { width: 95, align: 'right' });
  y += 24;

  doc.font('Helvetica').fontSize(9).fillColor(INK);
  for (const room of booking.rooms) {
    doc.text(room.name, 58, y, { width: 150 });
    doc.text(room.mealPlanName ?? (room.mealPlan ?? '').replace(/_/g, ' '), 210, y, { width: 100 });
    doc.text(String(room.quantity), 315, y, { width: 40 });
    doc.text(String(room.nights), 360, y, { width: 40 });
    doc.text(money(room.totalMinor, booking.amounts.currency), 440, y, { width: 95, align: 'right' });
    y += 18;
  }

  y += 6;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(BORDER).stroke();
  y += 12;

  const totalsRow = (label, value, { strong = false } = {}) => {
    doc.font(strong ? 'Helvetica-Bold' : 'Helvetica').fontSize(strong ? 11 : 9).fillColor(INK);
    doc.text(label, 310, y, { width: 125 });
    doc.text(value, 440, y, { width: 95, align: 'right' });
    y += strong ? 18 : 15;
  };
  totalsRow('Subtotal', money(booking.amounts.subtotal, booking.amounts.currency));
  if (booking.amounts.discount > 0) totalsRow('Discount', money(booking.amounts.discount, booking.amounts.currency));
  totalsRow('Taxes', money(booking.amounts.taxes, booking.amounts.currency));
  totalsRow('Fees', money(booking.amounts.fees, booking.amounts.currency));
  if (booking.amounts.couponDiscount > 0) {
    totalsRow(`Coupon (${booking.amounts.couponCode})`, money(booking.amounts.couponDiscount, booking.amounts.currency));
  }
  totalsRow('Total', money(booking.amounts.total, booking.amounts.currency), { strong: true });
  totalsRow('Paid', money(booking.amounts.paid, booking.amounts.currency));
  if (booking.amounts.refunded > 0) totalsRow('Refunded', money(booking.amounts.refunded, booking.amounts.currency));

  y += 10;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Payment', 50, y);
  y += 15;
  doc.font('Helvetica').fontSize(9).fillColor(BODY);
  doc.text(`Payment status: ${booking.paymentStatus}`, 50, y); y += 13;
  if (booking.payment) {
    doc.text(`Reference: ${booking.payment.id ?? booking.payment.orderId ?? '—'}`, 50, y); y += 13;
    if (booking.payment.paidAt) { doc.text(`Paid at: ${new Date(booking.payment.paidAt).toLocaleString('en-IN')}`, 50, y); y += 13; }
  }
  for (const refund of booking.refunds) {
    doc.text(`Refund (${refund.status}): ${money(refund.amount, booking.amounts.currency)}`, 50, y);
    y += 13;
  }

  if (booking.cancellation?.cancelledAt) {
    y += 8;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text('Cancellation', 50, y);
    y += 15;
    doc.font('Helvetica').fontSize(9).fillColor(BODY).text(booking.cancellation.description ?? 'Cancelled.', 50, y, { width: 495 });
  }

  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(
    'This is a system-generated invoice for your records, based on the booking as it was made.',
    50, 770, { width: 495, align: 'center' },
  );

  doc.end();
  return done;
}

export const invoiceService = {
  /** The booking's owner. `bookingService.details` already throws a 404 (not 403) for anyone else. */
  async forOwner(userId, bookingId) {
    const booking = await bookingService.details(userId, bookingId);
    return { filename: `${booking.bookingRef}-invoice.pdf`, buffer: await renderInvoicePdf(booking) };
  },

  /** ADMIN, or a HOTEL_OWNER scoped to their own hotels -- reuses the exact same admin-booking access check. */
  async forStaff(bookingId, actor) {
    const booking = await adminBookingService.detail(bookingId, actor);
    return { filename: `${booking.bookingRef}-invoice.pdf`, buffer: await renderInvoicePdf(booking) };
  },
};
