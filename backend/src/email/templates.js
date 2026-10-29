const BRAND = '#0f766e';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const money = (minor, currency = 'INR') => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency, maximumFractionDigits: 2,
}).format(Number(minor ?? 0) / 100);

const date = (value) => value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : 'Not provided';

function layout({ preheader, heading, intro, rows = [], cta, footer }) {
  const safeRows = rows.filter((row) => row?.[1] !== null && row?.[1] !== undefined && row?.[1] !== '');
  const textRows = safeRows.map(([label, value]) => `${label}: ${value}`).join('\n');
  const text = [heading, '', intro, textRows && `\n${textRows}`, cta && `\n${cta.label}: ${cta.url}`, footer && `\n${footer}`].filter(Boolean).join('\n');
  const table = safeRows.map(([label, value]) => `<tr><td style="padding:7px 12px;color:#64748b;vertical-align:top">${escapeHtml(label)}</td><td style="padding:7px 12px;color:#0f172a;font-weight:600">${escapeHtml(value)}</td></tr>`).join('');
  const button = cta ? `<p style="margin:28px 0"><a href="${escapeHtml(cta.url)}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;padding:13px 20px;border-radius:8px;font-weight:700">${escapeHtml(cta.label)}</a></p>` : '';
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"><title>${escapeHtml(heading)}</title></head><body style="margin:0;background:#f1f5f9;font-family:Arial,sans-serif;color:#0f172a"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preheader ?? heading)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:24px 12px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;margin:auto;background:#fff;border-radius:14px;overflow:hidden"><tr><td style="background:${BRAND};padding:22px 28px;color:#fff;font-size:24px;font-weight:800">Gokaasa</td></tr><tr><td style="padding:30px 28px"><h1 style="font-size:24px;margin:0 0 14px">${escapeHtml(heading)}</h1><p style="font-size:16px;line-height:1.6;color:#334155">${escapeHtml(intro)}</p>${table ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0;background:#f8fafc;border-radius:8px">${table}</table>` : ''}${button}<p style="font-size:13px;line-height:1.6;color:#64748b;margin-top:28px">${escapeHtml(footer ?? '')}</p></td></tr></table></td></tr></table></body></html>`;
  return { html, text };
}

const supportFooter = (p) => p.supportEmail ? `Need help? Contact ${p.supportEmail}.` : 'Need help? Visit Gokaasa support.';

export const emailTemplates = {
  welcome(p) {
    return { subject: 'Welcome to Gokaasa! Your account is ready', ...layout({
      heading: `Welcome${p.firstName ? `, ${p.firstName}` : ''}!`,
      intro: 'Your Gokaasa account has been created successfully. You can now save hotels and manage every trip in one place.',
      cta: { label: 'Open Gokaasa', url: p.frontendUrl }, footer: supportFooter(p),
    }) };
  },
  passwordReset(p) {
    return { subject: 'Reset your Gokaasa password', ...layout({
      heading: 'Reset your password', intro: `Use this secure, one-time link within ${p.ttlMinutes} minutes. If you did not request this, you can ignore this email.`,
      cta: { label: 'Reset Password', url: p.resetUrl }, footer: supportFooter(p),
    }) };
  },
  emailChangeCode(p) {
    return { subject: 'Verify your new Gokaasa email address', ...layout({
      heading: 'Verify your new email',
      intro: `Enter this verification code in your Gokaasa profile within ${p.ttlMinutes} minutes.`,
      rows: [['Verification code', p.code]],
      footer: `If you did not request this change, do not share the code. ${supportFooter(p)}`,
    }) };
  },
  emailChanged(p) {
    return { subject: 'Your Gokaasa sign-in email was changed', ...layout({
      heading: 'Email address changed',
      intro: 'The sign-in email for your Gokaasa account was changed successfully.',
      rows: [['New email', p.newEmail]],
      footer: `If you did not make this change, contact support immediately. ${supportFooter(p)}`,
    }) };
  },
  partnerApproved(p) {
    return { subject: 'Your Gokaasa partner application has been approved', ...layout({
      heading: 'Partner application approved', intro: `Congratulations${p.firstName ? `, ${p.firstName}` : ''}. Your application has been approved. Continue in the partner portal to add and prepare your property.`,
      cta: { label: 'Continue Property Setup', url: p.portalUrl }, footer: supportFooter(p),
    }) };
  },
  partnerRejected(p) {
    return { subject: 'Action required: Your Gokaasa partner application needs updates', ...layout({
      heading: 'Updates are needed', intro: 'Your partner application needs changes before it can be approved.',
      rows: [['Reviewer feedback', p.reason]], cta: { label: 'Review Application', url: p.portalUrl }, footer: supportFooter(p),
    }) };
  },
  hotelOnboarded(p) {
    return { subject: 'Your hotel has been onboarded to Gokaasa', ...layout({
      heading: 'Your hotel is now on Gokaasa', intro: `${p.hotelName} has been added with status ${String(p.status).replaceAll('_', ' ').toLowerCase()}. Complete the property details and submit it for review when ready.`,
      rows: [['Hotel', p.hotelName], ['Current status', p.status]], cta: { label: 'Open Partner Portal', url: p.portalUrl }, footer: supportFooter(p),
    }) };
  },
  propertyApproved(p) {
    return { subject: 'Your hotel has been approved on Gokaasa', ...layout({
      heading: 'Property review approved', intro: `${p.hotelName} is ready for the next publishing step. Review the listing and publish it when operationally ready.`,
      rows: [['Hotel', p.hotelName], ['Status', p.status]], cta: { label: 'Review Property', url: p.portalUrl }, footer: supportFooter(p),
    }) };
  },
  propertyRejected(p) {
    return { subject: 'Action required: Updates needed for your Gokaasa hotel', ...layout({
      heading: 'Property updates required', intro: `${p.hotelName} was returned to draft for updates.`,
      rows: [['Hotel', p.hotelName], ['Reviewer feedback', p.feedback || 'Please review the property details and submission requirements.']],
      cta: { label: 'Update Property', url: p.portalUrl }, footer: supportFooter(p),
    }) };
  },
  customerBooking(p) {
    return { subject: `Booking Confirmed! Your Gokaasa reservation at ${p.hotelName}`, ...layout({
      heading: 'Your booking is confirmed', intro: `Thanks${p.customerFirstName ? `, ${p.customerFirstName}` : ''}. Your reservation is secured.`,
      rows: [['Booking reference', p.bookingRef], ['Hotel', p.hotelName], ['Address', p.hotelAddress], ['Room', p.roomName], ['Rooms', p.rooms], ['Guests', p.guests], ['Check-in', date(p.checkIn)], ['Check-out', date(p.checkOut)], ['Nights', p.nights], ['Subtotal', money(p.subtotal, p.currency)], ['Discount', p.discount ? money(p.discount, p.currency) : null], ['Taxes', money(p.taxes, p.currency)], ['Fees', p.fees ? money(p.fees, p.currency) : null], ['Total paid', money(p.total, p.currency)], ['Payment status', p.paymentStatus], ['Payment method', p.paymentMethod], ['Payment reference', p.paymentReference], ['Cancellation policy', p.cancellationPolicy], ['Hotel contact', p.hotelContact]],
      cta: { label: 'View My Booking', url: p.bookingUrl }, footer: supportFooter(p),
    }) };
  },
  hotelBooking(p) {
    return { subject: `New Confirmed Booking — ${p.hotelName} — ${p.bookingRef}`, ...layout({
      heading: 'New confirmed reservation', intro: 'A confirmed reservation has been added for your property.',
      rows: [['Booking reference', p.bookingRef], ['Hotel', p.hotelName], ['Guest', p.customerName], ['Guest email', p.customerEmail], ['Guest phone', p.customerPhone], ['Room', p.roomName], ['Rooms', p.rooms], ['Guests', p.guests], ['Check-in', date(p.checkIn)], ['Check-out', date(p.checkOut)], ['Nights', p.nights], ['Reservation status', p.bookingStatus], ['Payment status', p.paymentStatus], ['Special requests', p.specialRequest], ['Cancellation policy', p.cancellationPolicy]],
      cta: { label: 'View Reservation', url: p.partnerBookingUrl }, footer: supportFooter(p),
    }) };
  },
  adminBooking(p) {
    return { subject: `New Confirmed Booking — ${p.hotelName} — ${p.bookingRef}`, ...layout({
      heading: 'New confirmed booking', intro: 'A booking has reached the authoritative confirmed state.',
      rows: [['Booking reference', p.bookingRef], ['Booking status', p.bookingStatus], ['Created', p.createdAt], ['Confirmed', p.confirmedAt], ['Hotel', p.hotelName], ['Property contact', p.ownerName], ['Customer', p.customerName], ['Customer email', p.customerEmail], ['Room', p.roomName], ['Rooms', p.rooms], ['Guests', p.guests], ['Check-in', date(p.checkIn)], ['Check-out', date(p.checkOut)], ['Nights', p.nights], ['Subtotal', money(p.subtotal, p.currency)], ['Discount', p.discount ? money(p.discount, p.currency) : null], ['Taxes', money(p.taxes, p.currency)], ['Fees', p.fees ? money(p.fees, p.currency) : null], ['Total', money(p.total, p.currency)], ['Payment status', p.paymentStatus], ['Payment provider', p.paymentProvider], ['Transaction reference', p.paymentReference]],
      cta: { label: 'View Booking in Admin Dashboard', url: p.adminBookingUrl }, footer: supportFooter(p),
    }) };
  },
  cancellation(p) {
    return { subject: `Booking cancelled: ${p.bookingRef}`, ...layout({ heading: 'Booking cancelled', intro: `Your booking ${p.bookingRef} at ${p.hotelName} has been cancelled.`, rows: [['Booking reference', p.bookingRef], ['Refund status', p.refundStatus]], cta: { label: 'View My Trips', url: p.bookingUrl }, footer: supportFooter(p) }) };
  },
  refundInitiated(p) {
    return { subject: `Refund initiated: ${p.bookingRef}`, ...layout({ heading: 'Refund initiated', intro: `A refund of ${money(p.amount, p.currency)} has been requested from the payment provider. This does not mean it has completed yet.`, rows: [['Booking reference', p.bookingRef], ['Status', 'Initiated']], cta: { label: 'View My Trips', url: p.bookingUrl }, footer: supportFooter(p) }) };
  },
  refundCompleted(p) {
    return { subject: `Refund processed: ${p.bookingRef}`, ...layout({ heading: 'Refund completed', intro: `Your refund of ${money(p.amount, p.currency)} has been confirmed by the payment provider.`, rows: [['Booking reference', p.bookingRef], ['Status', 'Completed']], cta: { label: 'View My Trips', url: p.bookingUrl }, footer: supportFooter(p) }) };
  },
};

export function renderEmail(template, payload) {
  const renderer = emailTemplates[template];
  if (!renderer) throw new Error(`Unknown email template: ${template}`);
  return renderer(payload);
}

