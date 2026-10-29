import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, renderEmail } from '../../src/email/templates.js';

describe('transactional email templates', () => {
  it('escapes untrusted dynamic HTML while retaining readable plain text', () => {
    const message = renderEmail('welcome', {
      firstName: '<img src=x onerror=alert(1)>',
      frontendUrl: 'https://gokaasa.example',
      supportEmail: 'support@example.com',
    });
    assert.doesNotMatch(message.html, /<img src=x/);
    assert.match(message.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
    assert.match(message.text, /<img src=x onerror=alert\(1\)>/);
    assert.equal(escapeHtml(`&<>"'`), '&amp;&lt;&gt;&quot;&#39;');
  });

  it('renders distinct customer, hotel and admin booking messages with the same reference', () => {
    const payload = {
      bookingRef: 'GK-2026-123456', hotelName: 'Harbour Hotel', customerName: 'Asha Kumar',
      customerEmail: 'asha@example.com', checkIn: '2026-11-10', checkOut: '2026-11-12',
      rooms: 1, guests: 2, nights: 2, currency: 'INR', subtotal: 10000, taxes: 1800,
      fees: 0, discount: 0, total: 11800, bookingStatus: 'CONFIRMED', paymentStatus: 'SUCCESS',
      bookingUrl: 'https://example.com/my-trips', partnerBookingUrl: 'https://example.com/admin/bookings',
      adminBookingUrl: 'https://example.com/admin/bookings',
    };
    const customer = renderEmail('customerBooking', payload);
    const hotel = renderEmail('hotelBooking', payload);
    const admin = renderEmail('adminBooking', payload);
    assert.match(customer.subject, /Booking Confirmed!/);
    assert.match(hotel.subject, /New Confirmed Booking/);
    assert.match(admin.text, /authoritative confirmed state/);
    for (const message of [customer, hotel, admin]) assert.match(message.text, /GK-2026-123456/);
  });

  it('renders staff email-change verification and old-address security notices', () => {
    const verification = renderEmail('emailChangeCode', {
      code: '123456', ttlMinutes: 10, supportEmail: 'support@example.com',
    });
    assert.match(verification.subject, /Verify your new/);
    assert.match(verification.text, /Verification code: 123456/);

    const notice = renderEmail('emailChanged', {
      newEmail: 'admin@company.example', supportEmail: 'support@example.com',
    });
    assert.match(notice.subject, /email was changed/);
    assert.match(notice.text, /admin@company\.example/);
  });
});
