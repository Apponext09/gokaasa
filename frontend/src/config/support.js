/**
 * Single source of truth for Gokaasa's support contact details, so the phone number and default message
 * are never duplicated across components.
 *
 * ASSUMPTION MADE EXPLICIT: the number provided (9876543210) was given with no country code. Gokaasa
 * operates in India, so it is prefixed with the Indian country code (91) here -- wa.me's click-to-chat
 * links require the full international number with no "+", spaces, or punctuation. If this number is
 * ever outside India, update `countryCode` below; nothing else needs to change.
 */
export const SUPPORT_CONFIG = Object.freeze({
  whatsapp: Object.freeze({
    countryCode: '91',
    localNumber: '9876543210',
    defaultMessage: 'Hello Gokaasa Support! I need help finding and booking a hotel, villa, or resort. Please assist me.',
  }),
});

/** Digits only, country code first -- exactly what wa.me requires (no "+", spaces, or punctuation). */
export function whatsAppPhoneDigits() {
  return `${SUPPORT_CONFIG.whatsapp.countryCode}${SUPPORT_CONFIG.whatsapp.localNumber}`.replace(/\D/g, '');
}

export function supportPhoneHref() {
  return `tel:+${whatsAppPhoneDigits()}`;
}

export function supportPhoneLabel() {
  const { countryCode, localNumber } = SUPPORT_CONFIG.whatsapp;
  const groupedNumber = localNumber.replace(/^(\d{5})(\d{5})$/, '$1 $2');
  return `+${countryCode} ${groupedNumber}`;
}

/** The full wa.me click-to-chat URL with a correctly URL-encoded prefilled message. */
export function buildWhatsAppUrl(message = SUPPORT_CONFIG.whatsapp.defaultMessage) {
  return `https://wa.me/${whatsAppPhoneDigits()}?text=${encodeURIComponent(message)}`;
}
