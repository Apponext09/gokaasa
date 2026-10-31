import { Router } from 'express';
import { hotelController } from '../controllers/hotel.controller.js';
import { hotelWorkspaceController } from '../controllers/hotelWorkspace.controller.js';
import { roomInventoryController as inv } from '../controllers/roomInventory.controller.js';
import { authenticate, requirePermission } from '../middleware/authenticate.js';
import { importSearchLimiter } from '../middleware/rateLimiters.js';
import { uploadSingleImage } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import {
  requireHotelAccess,
  requireHotelReadAccess,
  requireImportJobAccess,
  hotelIdFromParam,
  hotelIdFromRoomType,
  hotelIdFromCancellationPolicy,
  hotelIdFromRatePlan,
  hotelIdFromBlock,
} from '../middleware/hotelAccess.js';
import { requirePartnerApproved } from '../middleware/partnerAccess.js';
import { partnerReviewController } from '../controllers/partnerReview.controller.js';
import { partnerApplicationListQuery, partnerDecisionSchema, partnerDocumentParam, partnerUserIdParam } from '../validators/partner.validator.js';
import {
  adminHotelListQuery,
  hotelAmenitiesSchema,
  hotelCreateSchema,
  hotelStatusSchema,
  hotelUpdateSchema,
  idParam,
} from '../validators/hotel.validator.js';
import { importCreateSchema, importJobsQuery, importSearchSchema } from '../validators/hotelImport.validator.js';
import { cancelSchema } from '../validators/booking.validator.js';
import {
  fieldParam,
  imageOrderSchema,
  imageParam,
  imagePatchSchema,
  imageUploadFields,
  providerImageSchema,
  imageFromUrlSchema,
  verifyFieldsSchema,
} from '../validators/verification.validator.js';
import {
  blockCreateSchema,
  blockParam,
  bulkCalendarSchema,
  calendarQuery,
  policyCreateSchema,
  policyParam,
  policyUpdateSchema,
  ratePlanCreateSchema,
  ratePlanUpdateSchema,
  roomImageParam,
  roomImageReorderSchema,
  roomParam,
  roomTypeCreateSchema,
  roomTypeListQuery,
  roomTypeUpdateSchema,
} from '../validators/inventory.validator.js';
import { managerAssignSchema } from '../validators/manager.validator.js';
import { couponController } from '../controllers/coupon.controller.js';
import { couponCreateSchema, couponIdParam, couponListQuery, couponStatusSchema, couponUpdateSchema } from '../validators/coupon.validator.js';
import { adminSearchController } from '../controllers/adminSearch.controller.js';
import { adminSearchQuery } from '../validators/adminSearch.validator.js';
import { settingsController } from '../controllers/settings.controller.js';
import { settingsUpdateSchema } from '../validators/settings.validator.js';
import { managerController } from '../controllers/manager.controller.js';
import { adminBookingController } from '../controllers/adminBooking.controller.js';
import { adminCustomerController } from '../controllers/adminCustomer.controller.js';
import { adminUserController } from '../controllers/adminUser.controller.js';
import { auditLogController } from '../controllers/auditLog.controller.js';
import { reviewController } from '../controllers/review.controller.js';
import { adminReviewListQuery, moderateSchema, reviewIdParam } from '../validators/review.validator.js';
import {
  adminBookingIdParam,
  adminBookingListQuery,
  adminPaymentListQuery,
  adminRefundListQuery,
  adminCustomerIdParam,
  adminCustomerListQuery,
  customerStatusSchema,
  auditLogQuery,
  dashboardTrendsQuery,
  hotelPerformanceQuery,
} from '../validators/adminBooking.validator.js';
import { adminStaffCreateSchema, adminUserIdParam, adminUserListQuery, adminUserSessionParam, adminUserStatusSchema } from '../validators/adminUser.validator.js';
import { commissionConfigController } from '../controllers/commissionConfig.controller.js';
import { commissionRateSchema } from '../validators/commissionConfig.validator.js';
import { ledgerController } from '../controllers/ledger.controller.js';
import { earningsBookingParam, earningsSummaryQuery, ledgerEntryListQuery } from '../validators/ledger.validator.js';
import { settlementController } from '../controllers/settlement.controller.js';
import {
  settlementCreateSchema,
  settlementIdParam,
  settlementListQuery,
  settlementMarkPaidSchema,
  settlementReverseSchema,
} from '../validators/settlement.validator.js';
import { catalogController } from '../controllers/catalog.controller.js';
import { catalogCreateSchema, catalogItemParam, catalogKindParam, catalogUpdateSchema } from '../validators/catalog.validator.js';
import { restrictSpecializedStaff } from '../middleware/adminConsoleAccess.js';
import { pool } from '../db/pool.js';
import { homepageBackgroundController } from '../controllers/homepageBackground.controller.js';
import { hotelReviewController } from '../controllers/hotelReview.controller.js';
import {
  hotelReviewChangesSchema,
  hotelReviewDecisionSchema,
  hotelReviewListQuery,
} from '../validators/hotelReview.validator.js';
import { z } from 'zod';

/**
 * Everything under /api/admin requires an authenticated staff member. Individual actions narrow this
 * further where needed: publication actions are ADMIN-only inside the service (unchanged), and
 * HOTEL_OWNER is additionally scoped to hotels it is assigned to via `requireHotelAccess` below
 * (ADMIN always bypasses that check). A hotel a manager cannot access looks exactly like one that does
 * not exist — the same pattern already used for booking/payment ownership.
 *
 * HOTEL_OWNER (a self-service partner, see partner.routes.js) reuses this exact same surface once
 * approved: `requirePartnerApproved` blocks every route below for an owner whose partner_profiles
 * status isn't APPROVED yet (a no-op for other staff roles), then every existing scoping check
 * (hotel_managers, dashboardService.managerScopeOf, ...) applies to them unchanged, since none of those
 * checks are written as role-specific -- they already key off "ADMIN vs not-ADMIN, scoped by actor.id".
 */
export const adminRouter = Router();

// Live presence stream for the User Management dashboard. EventSource cannot send an Authorization
// header, so this one route sits BEFORE the staff bearer-auth gate below and authorizes itself via a
// short-lived, single-use ticket (see streamTicket.service.js) minted by the authenticated endpoint
// further down ('/users/stream-ticket'). It must stay above `adminRouter.use(staff)`.
adminRouter.get('/users/stream', adminUserController.stream);

const staff = [authenticate, requirePermission('console.access'), requirePartnerApproved, restrictSpecializedStaff];
adminRouter.use(staff);

adminRouter.get('/dashboard/summary', hotelController.dashboard);
adminRouter.get('/dashboard/trends', validate({ query: dashboardTrendsQuery }), hotelController.dashboardTrends);
adminRouter.get('/reports/hotel-performance', validate({ query: hotelPerformanceQuery }), hotelController.hotelPerformance);
adminRouter.get('/dashboard/alerts', hotelController.dashboardAlerts);
adminRouter.get('/search', validate({ query: adminSearchQuery }), adminSearchController.search);

// Internal hotel quality review. This is separate from guest ratings/reviews under /reviews.
adminRouter.get('/hotel-reviews', validate({ query: hotelReviewListQuery }), requirePermission('hotel.review'), hotelReviewController.list);
adminRouter.get('/hotels/:id/review', validate({ params: idParam }), requireHotelReadAccess(hotelIdFromParam), hotelReviewController.detail);
adminRouter.post('/hotels/:id/review/request-changes', validate({ params: idParam, body: hotelReviewChangesSchema }), requirePermission('hotel.review'), hotelReviewController.requestChanges);
adminRouter.post('/hotels/:id/review/approve', validate({ params: idParam, body: hotelReviewDecisionSchema }), requirePermission('hotel.review'), hotelReviewController.approve);

// Platform master data. Reads and writes are ADMIN-only because every hotel and room uses these values.
adminRouter.get('/catalogs/:kind', validate({ params: catalogKindParam }), requirePermission('catalog.manage'), catalogController.adminList);
adminRouter.post('/catalogs/:kind', validate({ params: catalogKindParam, body: catalogCreateSchema }), requirePermission('catalog.manage'), catalogController.create);
adminRouter.patch('/catalogs/:kind/:code', validate({ params: catalogItemParam, body: catalogUpdateSchema }), requirePermission('catalog.manage'), catalogController.update);
adminRouter.get('/homepage-background-images', requirePermission('homepage.manage'), homepageBackgroundController.list);
adminRouter.put(
  '/homepage-background-images/:slot',
  validate({ params: z.object({ slot: z.coerce.number().int().min(1).max(4) }) }),
  requirePermission('homepage.manage'),
  uploadSingleImage,
  homepageBackgroundController.replace,
);
adminRouter.delete(
  '/homepage-background-images/:slot',
  validate({ params: z.object({ slot: z.coerce.number().int().min(1).max(4) }) }),
  requirePermission('homepage.manage'),
  homepageBackgroundController.remove,
);

adminRouter.get('/settings', requirePermission('settings.manage'), settingsController.get);
adminRouter.patch('/settings', validate({ body: settingsUpdateSchema }), requirePermission('settings.manage'), settingsController.update);

// Commission configuration. Global (hotel_id null) and per-hotel overrides. A hotel's own effective rate
// is readable by that hotel's own manager/owner (requireHotelAccess, below); only ADMIN may add a new
// rate row anywhere -- an admin-level pricing lever, same policy as /coupons and /settings' PATCH.
adminRouter.get('/commission-config', commissionConfigController.getGlobal);
adminRouter.put('/commission-config', validate({ body: commissionRateSchema }), requirePermission('commission.manage'), commissionConfigController.setGlobal);
adminRouter.get(
  '/hotels/:id/commission',
  validate({ params: idParam }),
  requireHotelAccess(hotelIdFromParam),
  commissionConfigController.getForHotel,
);
adminRouter.put(
  '/hotels/:id/commission',
  validate({ params: idParam, body: commissionRateSchema }),
  requirePermission('commission.manage'),
  commissionConfigController.setForHotel,
);

// Partner earnings / ledger. HOTEL_OWNER is scoped to their own hotels exactly like
// /bookings, /payments, /refunds below; ADMIN sees any hotel, or everything via no ?hotelId= at all.
adminRouter.get('/earnings/summary', validate({ query: earningsSummaryQuery }), ledgerController.summary);
adminRouter.get('/earnings/ledger', validate({ query: ledgerEntryListQuery }), ledgerController.entries);
adminRouter.get('/earnings/bookings/:bookingId', validate({ params: earningsBookingParam }), ledgerController.bookingDetail);

// Settlements. Creating/approving/paying/reversing a batch is a financial-operations action -- ADMIN
// only, same policy as /customers status changes and /users. Listing/detail stay staff-visible so a
// HOTEL_OWNER can see their own hotel's settlement history (scoped in the service).
adminRouter.get('/settlements', validate({ query: settlementListQuery }), settlementController.list);
adminRouter.get('/settlements/:id', validate({ params: settlementIdParam }), settlementController.detail);
adminRouter.post('/settlements', validate({ body: settlementCreateSchema }), requirePermission('settlement.manage'), settlementController.create);
adminRouter.post('/settlements/:id/approve', validate({ params: settlementIdParam }), requirePermission('settlement.manage'), settlementController.approve);
adminRouter.post(
  '/settlements/:id/mark-paid',
  validate({ params: settlementIdParam, body: settlementMarkPaidSchema }),
  requirePermission('settlement.manage'),
  settlementController.markPaid,
);
adminRouter.post(
  '/settlements/:id/reverse',
  validate({ params: settlementIdParam, body: settlementReverseSchema }),
  requirePermission('settlement.manage'),
  settlementController.reverse,
);

adminRouter.get('/hotels', validate({ query: adminHotelListQuery }), hotelController.listAdmin);
adminRouter.get('/exports/hotels', validate({ query: adminHotelListQuery }), hotelController.exportHotelsCsv);
adminRouter.post('/hotels', validate({ body: hotelCreateSchema }), hotelController.createManual);
adminRouter.get('/hotels/:id', validate({ params: idParam }), requireHotelReadAccess(hotelIdFromParam), hotelController.getAdmin);
adminRouter.patch('/hotels/:id', validate({ params: idParam, body: hotelUpdateSchema }), requireHotelAccess(hotelIdFromParam), hotelController.update);
adminRouter.put(
  '/hotels/:id/amenities',
  validate({ params: idParam, body: hotelAmenitiesSchema }),
  requireHotelAccess(hotelIdFromParam),
  hotelController.setAmenities,
);
adminRouter.post(
  '/hotels/:id/status',
  validate({ params: idParam, body: hotelStatusSchema }),
  requireHotelReadAccess(hotelIdFromParam),
  hotelController.transition,
);

// Per-hotel onboarding assignments for internal onboarding executives.
adminRouter.get('/onboarding-executives', requirePermission('onboarding.assign'), managerController.listOnboardingExecutives);
adminRouter.get('/hotels/:id/onboarding-executives', validate({ params: idParam }), requirePermission('onboarding.assign'), managerController.listOnboardingForHotel);
adminRouter.post(
  '/hotels/:id/onboarding-executives',
  validate({ params: idParam, body: managerAssignSchema }),
  requirePermission('onboarding.assign'),
  managerController.assignOnboarding,
);
adminRouter.delete(
  '/hotels/:id/onboarding-executives/:userId',
  validate({ params: idParam.extend({ userId: idParam.shape.id }) }),
  requirePermission('onboarding.assign'),
  managerController.unassignOnboarding,
);

// Coupons / offers. ADMIN and SALES_EXECUTIVE may manage offers; permanent deletion stays ADMIN-only.
adminRouter.get('/coupons', validate({ query: couponListQuery }), requirePermission('offer.manage'), couponController.list);
adminRouter.post('/coupons', validate({ body: couponCreateSchema }), requirePermission('offer.manage'), couponController.create);
adminRouter.get('/coupons/:id', validate({ params: couponIdParam }), requirePermission('offer.manage'), couponController.detail);
adminRouter.patch('/coupons/:id', validate({ params: couponIdParam, body: couponUpdateSchema }), requirePermission('offer.manage'), couponController.update);
adminRouter.patch('/coupons/:id/status', validate({ params: couponIdParam, body: couponStatusSchema }), requirePermission('offer.manage'), couponController.setStatus);
adminRouter.post(
  '/coupons/:id/image',
  validate({ params: couponIdParam }),
  requirePermission('offer.manage'),
  uploadSingleImage,
  couponController.uploadImage,
);
adminRouter.delete('/coupons/:id', validate({ params: couponIdParam }), requirePermission('offer.delete'), couponController.remove);

// Minimal hotel lookup used by Sales when an offer applies to selected properties. It intentionally
// excludes addresses, contacts, status internals and editing links.
adminRouter.get('/lookups/hotels', async (_req, res) => {
  const { rows } = await pool.query(
    `SELECT id, name FROM hotels WHERE deleted_at IS NULL ORDER BY name, id LIMIT 500`,
  );
  return res.json({ hotels: rows });
});

// Verification and provider reconciliation
adminRouter.post(
  '/hotels/:id/verify-fields',
  validate({ params: idParam, body: verifyFieldsSchema }),
  requireHotelAccess(hotelIdFromParam),
  hotelWorkspaceController.verifyFields,
);
adminRouter.post(
  '/hotels/:id/sync-external',
  validate({ params: idParam }),
  requireHotelAccess(hotelIdFromParam),
  hotelWorkspaceController.syncExternal,
);
adminRouter.post(
  '/hotels/:id/fields/:field/accept-suggestion',
  validate({ params: fieldParam }),
  requireHotelAccess(hotelIdFromParam),
  hotelWorkspaceController.acceptSuggestion,
);
adminRouter.post(
  '/hotels/:id/fields/:field/dismiss-suggestion',
  validate({ params: fieldParam }),
  requireHotelAccess(hotelIdFromParam),
  hotelWorkspaceController.dismissSuggestion,
);

// Images. Uploads are authenticated (staff only) and validated by content, not by client-supplied type.
adminRouter.get('/hotels/:id/images', validate({ params: idParam }), requireHotelAccess(hotelIdFromParam), hotelWorkspaceController.listImages);
adminRouter.post(
  '/hotels/:id/images',
  validate({ params: idParam }),
  requireHotelAccess(hotelIdFromParam),
  uploadSingleImage,
  validate({ body: imageUploadFields }),
  hotelWorkspaceController.uploadImage,
);
adminRouter.post(
  '/hotels/:id/images/from-provider',
  validate({ params: idParam, body: providerImageSchema }),
  requireHotelAccess(hotelIdFromParam),
  hotelWorkspaceController.addProviderImage,
);
// Attaches a real image fetched from a free/public source (e.g. Wikimedia Commons), ADMIN or the
// hotel's own manager -- same access rule as every other image-management action.
adminRouter.post(
  '/hotels/:id/images/from-url',
  validate({ params: idParam, body: imageFromUrlSchema }),
  requireHotelAccess(hotelIdFromParam),
  hotelWorkspaceController.addImageFromUrl,
);
adminRouter.put(
  '/hotels/:id/images/order',
  validate({ params: idParam, body: imageOrderSchema }),
  requireHotelAccess(hotelIdFromParam),
  hotelWorkspaceController.reorderImages,
);
adminRouter.patch(
  '/hotels/:id/images/:imageId',
  validate({ params: imageParam, body: imagePatchSchema }),
  requireHotelAccess(hotelIdFromParam),
  hotelWorkspaceController.updateImage,
);
adminRouter.post(
  '/hotels/:id/images/:imageId/replace',
  validate({ params: imageParam }),
  requireHotelAccess(hotelIdFromParam),
  uploadSingleImage,
  hotelWorkspaceController.replaceImage,
);
adminRouter.post(
  '/hotels/:id/images/:imageId/cover',
  validate({ params: imageParam }),
  requireHotelAccess(hotelIdFromParam),
  hotelWorkspaceController.setCover,
);
adminRouter.delete(
  '/hotels/:id/images/:imageId',
  validate({ params: imageParam }),
  requireHotelAccess(hotelIdFromParam),
  hotelWorkspaceController.removeImage,
);

adminRouter.get(
  '/hotels/:id/import-history',
  validate({ params: idParam }),
  requireHotelReadAccess(hotelIdFromParam),
  hotelWorkspaceController.importHistory,
);

// Hotel onboarding (provider search and import jobs). Search/request are not hotel-scoped: there is no
// hotel yet. Once a job exists, access narrows to its creator or (once resolved) its assigned hotel.
adminRouter.post(
  '/hotel-import/search',
  importSearchLimiter,
  validate({ body: importSearchSchema }),
  hotelController.importSearch,
);
adminRouter.post('/hotel-import/import', validate({ body: importCreateSchema }), hotelController.importRequest);
adminRouter.get('/hotel-import/jobs', validate({ query: importJobsQuery }), hotelController.importJobs);
adminRouter.get('/hotel-import/jobs/:id', validate({ params: idParam }), requireImportJobAccess, hotelController.importJob);
adminRouter.get('/hotel-import/jobs/:id/review', validate({ params: idParam }), requireImportJobAccess, hotelWorkspaceController.importReview);
adminRouter.post('/hotel-import/jobs/:id/discard', validate({ params: idParam }), requireImportJobAccess, hotelWorkspaceController.discardImport);
adminRouter.get('/hotel-import/providers', hotelController.providers);

// Room types, room images and room amenities. Access is role- and hotel-scoped by the guards above.
adminRouter.get(
  '/hotels/:id/room-types',
  validate({ params: idParam, query: roomTypeListQuery }),
  requireHotelReadAccess(hotelIdFromParam),
  inv.listRoomTypes,
);
adminRouter.get(
  '/hotels/:id/room-types/next-code',
  validate({ params: idParam }),
  requireHotelAccess(hotelIdFromParam),
  inv.nextRoomCode,
);
adminRouter.post(
  '/hotels/:id/room-types',
  validate({ params: idParam, body: roomTypeCreateSchema }),
  requireHotelAccess(hotelIdFromParam),
  inv.createRoomType,
);
adminRouter.get('/room-types/:id', validate({ params: roomParam }), requireHotelReadAccess(hotelIdFromRoomType), inv.getRoomType);
adminRouter.patch(
  '/room-types/:id',
  validate({ params: roomParam, body: roomTypeUpdateSchema }),
  requireHotelAccess(hotelIdFromRoomType),
  inv.updateRoomType,
);
adminRouter.post('/room-types/:id/archive', validate({ params: roomParam }), requireHotelAccess(hotelIdFromRoomType), inv.archiveRoomType);
adminRouter.put(
  '/room-types/:id/amenities',
  validate({ params: roomParam, body: hotelAmenitiesSchema }),
  requireHotelAccess(hotelIdFromRoomType),
  inv.setRoomAmenities,
);
adminRouter.post(
  '/room-types/:id/images',
  validate({ params: roomParam }),
  requireHotelAccess(hotelIdFromRoomType),
  uploadSingleImage,
  inv.uploadRoomImage,
);
adminRouter.delete(
  '/room-types/:id/images/:imageId',
  validate({ params: roomImageParam }),
  requireHotelAccess(hotelIdFromRoomType),
  inv.removeRoomImage,
);
adminRouter.post(
  '/room-types/:id/images/:imageId/replace',
  validate({ params: roomImageParam }),
  requireHotelAccess(hotelIdFromRoomType),
  uploadSingleImage,
  inv.replaceRoomImage,
);
adminRouter.post(
  '/room-types/:id/images/:imageId/cover',
  validate({ params: roomImageParam }),
  requireHotelAccess(hotelIdFromRoomType),
  inv.setRoomCover,
);
adminRouter.put(
  '/room-types/:id/images/order',
  validate({ params: roomParam, body: roomImageReorderSchema }),
  requireHotelAccess(hotelIdFromRoomType),
  inv.reorderRoomImages,
);

// Cancellation policies (reusable per hotel)
adminRouter.get(
  '/hotels/:id/cancellation-policies',
  validate({ params: idParam }),
  requireHotelReadAccess(hotelIdFromParam),
  inv.listPolicies,
);
adminRouter.post(
  '/hotels/:id/cancellation-policies',
  validate({ params: idParam, body: policyCreateSchema }),
  requireHotelAccess(hotelIdFromParam),
  inv.createPolicy,
);
adminRouter.patch(
  '/cancellation-policies/:id',
  validate({ params: policyParam, body: policyUpdateSchema }),
  requireHotelAccess(hotelIdFromCancellationPolicy),
  inv.updatePolicy,
);
adminRouter.post(
  '/cancellation-policies/:id/archive',
  validate({ params: policyParam }),
  requireHotelAccess(hotelIdFromCancellationPolicy),
  inv.archivePolicy,
);

// Rate plans
adminRouter.get('/room-types/:id/rate-plans', validate({ params: roomParam }), requireHotelReadAccess(hotelIdFromRoomType), inv.listRatePlans);
adminRouter.post(
  '/room-types/:id/rate-plans',
  validate({ params: roomParam, body: ratePlanCreateSchema }),
  requireHotelAccess(hotelIdFromRoomType),
  inv.createRatePlan,
);
adminRouter.patch(
  '/rate-plans/:id',
  validate({ params: policyParam, body: ratePlanUpdateSchema }),
  requireHotelAccess(hotelIdFromRatePlan),
  inv.updateRatePlan,
);

// Rate calendar, bulk pricing and inventory settings
adminRouter.get(
  '/room-types/:id/calendar',
  validate({ params: roomParam, query: calendarQuery }),
  requireHotelReadAccess(hotelIdFromRoomType),
  inv.calendar,
);
adminRouter.post(
  '/room-types/:id/calendar/bulk',
  validate({ params: roomParam, body: bulkCalendarSchema }),
  requireHotelAccess(hotelIdFromRoomType),
  inv.bulkCalendar,
);

// Maintenance and owner blocks
adminRouter.get('/room-types/:id/blocks', validate({ params: roomParam }), requireHotelReadAccess(hotelIdFromRoomType), inv.listBlocks);
adminRouter.post(
  '/room-types/:id/blocks',
  validate({ params: roomParam, body: blockCreateSchema }),
  requireHotelAccess(hotelIdFromRoomType),
  inv.createBlock,
);
adminRouter.delete('/availability-blocks/:id', validate({ params: blockParam }), requireHotelAccess(hotelIdFromBlock), inv.deactivateBlock);

// Bookings, payments and refunds: ADMIN sees everything; HOTEL_OWNER is
// scoped to its assigned hotels inside the service layer (list/detail queries filter by hotel_managers).
adminRouter.get('/bookings', validate({ query: adminBookingListQuery }), adminBookingController.list);
adminRouter.get('/exports/bookings', validate({ query: adminBookingListQuery }), adminBookingController.exportBookingsCsv);
adminRouter.get('/bookings/:id', validate({ params: adminBookingIdParam }), adminBookingController.detail);
adminRouter.get('/bookings/:id/invoice', validate({ params: adminBookingIdParam }), adminBookingController.downloadInvoice);
adminRouter.post(
  '/bookings/:id/cancel',
  validate({ params: adminBookingIdParam, body: cancelSchema }),
  adminBookingController.cancel,
);
adminRouter.get('/payments', validate({ query: adminPaymentListQuery }), adminBookingController.listPayments);
adminRouter.get('/exports/payments', validate({ query: adminPaymentListQuery }), adminBookingController.exportPaymentsCsv);
adminRouter.get('/refunds', validate({ query: adminRefundListQuery }), adminBookingController.listRefunds);
adminRouter.get('/exports/refunds', validate({ query: adminRefundListQuery }), adminBookingController.exportRefundsCsv);

// Customers. ADMIN sees all; HOTEL_OWNER sees only customers who booked one of their hotels.
adminRouter.get('/customers', validate({ query: adminCustomerListQuery }), adminCustomerController.list);
adminRouter.get('/exports/customers', validate({ query: adminCustomerListQuery }), adminCustomerController.exportCsv);
adminRouter.get('/customers/:id', validate({ params: adminCustomerIdParam }), adminCustomerController.detail);
// Deactivating a guest account is a platform-wide, sensitive action -- ADMIN only, unlike the read routes above.
adminRouter.patch(
  '/customers/:id/status',
  validate({ params: adminCustomerIdParam, body: customerStatusSchema }),
  requirePermission('customer.manage'),
  adminCustomerController.setStatus,
);

// User Management: a unified, presence-aware directory across every role (customers, hotel owners,
// admins). ADMIN only -- unlike /customers, this can reveal other staff accounts, so it is not opened
// restricted to ADMIN even for read access.
adminRouter.post('/users/stream-ticket', requirePermission('user.manage'), adminUserController.issueStreamTicket);
adminRouter.post('/users/staff', validate({ body: adminStaffCreateSchema }), requirePermission('user.manage'), adminUserController.createStaff);
adminRouter.get('/users/kpis', requirePermission('user.manage'), adminUserController.kpis);
adminRouter.get('/users', validate({ query: adminUserListQuery }), requirePermission('user.manage'), adminUserController.list);
adminRouter.get('/users/:id', validate({ params: adminUserIdParam }), requirePermission('user.manage'), adminUserController.detail);
adminRouter.patch(
  '/users/:id/status',
  validate({ params: adminUserIdParam, body: adminUserStatusSchema }),
  requirePermission('user.manage'),
  adminUserController.setStatus,
);
adminRouter.post('/users/:id/force-signout', validate({ params: adminUserIdParam }), requirePermission('user.manage'), adminUserController.forceSignOut);
adminRouter.delete(
  '/users/:id/sessions/:sessionId',
  validate({ params: adminUserSessionParam }),
  requirePermission('user.manage'),
  adminUserController.revokeSession,
);

// Audit log viewer. ADMIN only — it can reveal other staff members' actions across every hotel.
adminRouter.get('/audit-logs', validate({ query: auditLogQuery }), requirePermission('audit.read'), auditLogController.list);

// Reviews moderation. HOTEL_OWNER gets read-only visibility into its own hotels (scoped in the service,
// same hotel_managers table as everything else); only ADMIN may change a review's status.
adminRouter.get('/reviews', validate({ query: adminReviewListQuery }), reviewController.listForModeration);
adminRouter.get('/exports/reviews', validate({ query: adminReviewListQuery }), reviewController.exportReviewsCsv);
adminRouter.post('/reviews/:id/moderate', validate({ params: reviewIdParam, body: moderateSchema }), requirePermission('review.moderate'), reviewController.moderate);

// Partner (HOTEL_OWNER) application review queue. ADMIN only -- approving a partner grants them the
// same hotel-management access as a HOTEL_OWNER, so this is an admin-level action like /settings.
adminRouter.get('/partners', validate({ query: partnerApplicationListQuery }), requirePermission('partner.review'), partnerReviewController.list);
adminRouter.get('/partners/:userId', validate({ params: partnerUserIdParam }), requirePermission('partner.review'), partnerReviewController.detail);
adminRouter.post('/partners/:userId/approve', validate({ params: partnerUserIdParam }), requirePermission('partner.review'), partnerReviewController.approve);
adminRouter.post(
  '/partners/:userId/reject',
  validate({ params: partnerUserIdParam, body: partnerDecisionSchema }),
  requirePermission('partner.review'),
  partnerReviewController.reject,
);
adminRouter.get(
  '/partners/:userId/documents/:docId/file',
  validate({ params: partnerDocumentParam }),
  requirePermission('partner.review'),
  partnerReviewController.getDocumentFile,
);
