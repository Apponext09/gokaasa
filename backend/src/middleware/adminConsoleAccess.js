import { AppError } from '../utils/AppError.js';

const SALES_RULES = [
  ['GET', /^\/bookings(?:\/\d+)?$/],
  ['GET', /^\/bookings\/\d+\/invoice$/],
  ['GET', /^\/exports\/(?:bookings|payments|refunds)$/],
  ['GET', /^\/(?:payments|refunds)$/],
  ['GET', /^\/coupons(?:\/\d+)?$/],
  ['POST', /^\/coupons$/],
  ['PATCH', /^\/coupons\/\d+(?:\/status)?$/],
  ['POST', /^\/coupons\/\d+\/image$/],
  ['GET', /^\/lookups\/hotels$/],
];

const ONBOARDING_RULES = [
  ['GET', /^\/hotels$/],
  ['POST', /^\/hotels$/],
  ['GET', /^\/hotels\/\d+$/],
  ['PATCH', /^\/hotels\/\d+$/],
  ['PUT', /^\/hotels\/\d+\/amenities$/],
  ['POST', /^\/hotels\/\d+\/(?:status|verify-fields|sync-external)$/],
  ['POST', /^\/hotels\/\d+\/fields\/[^/]+\/(?:accept-suggestion|dismiss-suggestion)$/],
  ['GET', /^\/hotels\/\d+\/images$/],
  ['POST', /^\/hotels\/\d+\/images(?:\/from-provider|\/from-url)?$/],
  ['PUT', /^\/hotels\/\d+\/images\/order$/],
  ['PATCH', /^\/hotels\/\d+\/images\/\d+$/],
  ['POST', /^\/hotels\/\d+\/images\/\d+\/(?:replace|cover)$/],
  ['DELETE', /^\/hotels\/\d+\/images\/\d+$/],
  ['GET', /^\/hotels\/\d+\/import-history$/],
  ['GET', /^\/hotels\/\d+\/room-types(?:\/next-code)?$/],
  ['POST', /^\/hotels\/\d+\/room-types$/],
  ['GET', /^\/room-types\/\d+$/],
  ['PATCH', /^\/room-types\/\d+$/],
  ['POST', /^\/room-types\/\d+\/archive$/],
  ['PUT', /^\/room-types\/\d+\/amenities$/],
  ['POST', /^\/room-types\/\d+\/images(?:\/\d+\/(?:replace|cover))?$/],
  ['PUT', /^\/room-types\/\d+\/images\/order$/],
  ['DELETE', /^\/room-types\/\d+\/images\/\d+$/],
  ['GET', /^\/hotels\/\d+\/cancellation-policies$/],
  ['POST', /^\/hotels\/\d+\/cancellation-policies$/],
  ['PATCH', /^\/cancellation-policies\/\d+$/],
  ['POST', /^\/cancellation-policies\/\d+\/archive$/],
  ['GET', /^\/room-types\/\d+\/rate-plans$/],
  ['POST', /^\/room-types\/\d+\/rate-plans$/],
  ['PATCH', /^\/rate-plans\/\d+$/],
  ['GET', /^\/room-types\/\d+\/calendar$/],
  ['POST', /^\/room-types\/\d+\/calendar\/bulk$/],
  ['GET', /^\/room-types\/\d+\/blocks$/],
  ['POST', /^\/room-types\/\d+\/blocks$/],
  ['DELETE', /^\/availability-blocks\/\d+$/],
  ['POST', /^\/hotel-import\/(?:search|import)$/],
  ['GET', /^\/hotel-import\/(?:jobs|providers)$/],
  ['GET', /^\/hotel-import\/jobs\/\d+(?:\/review)?$/],
  ['POST', /^\/hotel-import\/jobs\/\d+\/discard$/],
  ['GET', /^\/hotels\/\d+\/review$/],
  ['POST', /^\/hotels\/\d+\/review\/issues\/\d+\/fix$/],
];

const REVIEW_RULES = [
  ['GET', /^\/hotel-reviews$/],
  ['GET', /^\/hotels\/\d+$/],
  ['GET', /^\/hotels\/\d+\/room-types$/],
  ['GET', /^\/room-types\/\d+$/],
  ['GET', /^\/room-types\/\d+\/rate-plans$/],
  ['GET', /^\/room-types\/\d+\/calendar$/],
  ['GET', /^\/room-types\/\d+\/blocks$/],
  ['GET', /^\/hotels\/\d+\/cancellation-policies$/],
  ['GET', /^\/hotels\/\d+\/import-history$/],
  ['GET', /^\/hotel-import\/jobs\/\d+$/],
  ['GET', /^\/hotels\/\d+\/review$/],
  ['POST', /^\/hotels\/\d+\/review\/(?:request-changes|approve)$/],
  ['POST', /^\/hotels\/\d+\/status$/],
];

function allowed(rules, req) {
  return rules.some(([method, pattern]) => req.method === method && pattern.test(req.path));
}

/**
 * Database permissions select a console profile; the profile's route allow-list prevents a hidden
 * frontend link from becoming accidental API access. Role names are intentionally not consulted.
 */
export function restrictSpecializedStaff(req, _res, next) {
  const permissions = req.user?.permissions ?? [];
  if (permissions.some((permission) => ['console.full', 'console.owner'].includes(permission))) return next();
  if (permissions.includes('console.sales') && allowed(SALES_RULES, req)) return next();
  if (permissions.includes('console.onboarding') && allowed(ONBOARDING_RULES, req)) return next();
  if (permissions.includes('console.review') && allowed(REVIEW_RULES, req)) return next();
  return next(AppError.forbidden());
}
