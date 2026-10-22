import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORT_CONFIG, buildWhatsAppUrl, whatsAppPhoneDigits } from '../../src/config/support.js';

test('the WhatsApp number is normalised to digits only, Indian country code first, no plus sign', () => {
  assert.equal(whatsAppPhoneDigits(), '919876543210');
  assert.doesNotMatch(whatsAppPhoneDigits(), /[+\s-]/);
});

test('buildWhatsAppUrl produces a correct wa.me click-to-chat URL with the default message', () => {
  const url = buildWhatsAppUrl();
  assert.match(url, /^https:\/\/wa\.me\/919876543210\?text=/);
  const text = new URL(url).searchParams.get('text');
  assert.equal(text, SUPPORT_CONFIG.whatsapp.defaultMessage);
});

test('the prefilled message is correctly URL-encoded, including spaces and punctuation', () => {
  const url = buildWhatsAppUrl('Hello! I need help, please & thanks.');
  assert.ok(url.includes(encodeURIComponent('Hello! I need help, please & thanks.')));
  // "!" is correctly left unescaped by encodeURIComponent (RFC 3986 unreserved); space/comma/& are not.
  assert.doesNotMatch(url.split('?text=')[1], /[ ,&]/, 'raw unencoded spaces/punctuation must not appear in the query string');
});

test('a custom message overrides the default without mutating the shared config', () => {
  buildWhatsAppUrl('Something else entirely');
  assert.equal(SUPPORT_CONFIG.whatsapp.defaultMessage, 'Hello Gokaasa Support! I need help finding and booking a hotel, villa, or resort. Please assist me.');
});
