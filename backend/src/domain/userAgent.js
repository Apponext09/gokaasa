/**
 * Coarse browser/OS family detection from the User-Agent header -- no device fingerprinting, no
 * version numbers, no unique identifiers. Good enough for "Chrome on Windows"; anything unrecognized
 * falls back to null, which the UI shows as "Not available".
 */
export function parseUserAgent(userAgent) {
  const ua = typeof userAgent === 'string' ? userAgent : '';

  let os = null;
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/mac os x/i.test(ua)) os = 'macOS';
  else if (/linux/i.test(ua)) os = 'Linux';

  let browser = null;
  if (/edg\//i.test(ua)) browser = 'Edge';
  else if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) browser = 'Chrome';
  else if (/firefox\//i.test(ua)) browser = 'Firefox';
  else if (/safari\//i.test(ua) && /version\//i.test(ua)) browser = 'Safari';
  else if (/opr\//i.test(ua)) browser = 'Opera';

  return { browser, os };
}
