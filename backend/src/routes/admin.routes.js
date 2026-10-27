import { Router } from 'express';
import { hotelController } from '../controllers/hotel.controller.js';
import { hotelWorkspaceController } from '../controllers/hotelWorkspace.controller.js';
import { roomInventoryController as inv } from '../controllers/roomInventory.controller.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { importSearchLimiter } from '../middleware/rateLimiters.js';
import { uploadSingleImage } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import {
  requireHotelAccess,
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
import { managerAssignSchema, managerIdParam, managerListQuery } from '../validators/manager.validator.js';
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
import { adminUserIdParam, adminUserListQuery, adminUserSessionParam, adminUserStatusSchema } from '../validators/adminUser.validator.js';
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

/**
 * Everything under /api/admin requires an authenticated staff member. Individual actions narrow this
 * further where needed: publication actions are ADMIN-only inside the service (unchanged), and
 * HOTEL_MANAGER is additionally scoped to hotels it is assigned to via `requireHotelAccess` below
 * (ADMIN always bypasses that check). A hotel a manager cannot access looks exactly like one that does
 * not exist — the same pattern already used for booking/payment ownership.
 *
 * HOTEL_OWNER (a self-service partner, see partner.routes.js) reuses this exact same surface once
 * approved: `requirePartnerApproved` blocks every route below for an owner whose partner_profiles
 * status isn't APPROVED yet (a no-op for ADMIN/HOTEL_MANAGER), then every existing scoping check
 * (hotel_managers, dashboardService.managerScopeOf, ...) applies to them unchanged, since none of those
 * checks are written as role-specific -- they already key off "ADMIN vs not-ADMIN, scoped by actor.id".
 */
export const adminRouter = Router();

// Live presence stream for the User Management dashboard. EventSource cannot send an Authorization
// header, so this one route sits BEFORE the staff bearer-auth gate below and authorizes itself via a
// short-lived, single-use ticket (see streamTicket.service.js) minted by the authenticated endpoint
// further down ('/users/stream-ticket'). It must stay above `adminRouter.use(staff)`.
adminRouter.get('/users/stream', adminUserController.stream);

const staff = [authenticate, authorize('ADMIN', 'HOTEL_MANAGER', 'HOTEL_OWNER'), requirePartnerApproved];
adminRouter.use(staff);

adminRouter.get('/dashboard/summary', hotelController.dashboard);
adminRouter.get('/dashboard/trends', validate({ query: dashboardTrendsQuery }), hotelController.dashboardTrends);
adminRouter.get('/reports/hotel-performance', validate({ query: hotelPerformanceQuery }), hotelController.hotelPerformance);
adminRouter.get('/dashboard/alerts', hotelController.dashboardAlerts);
adminRouter.get('/search', validate({ query: adminSearchQuery }), adminSearchController.search);

adminRouter.get('/settings', settingsController.get);
adminRouter.patch('/settings', validate({ body: settingsUpdateSchema }), authorize('ADMIN'), settingsController.update);

// Commission configuration. Global (hotel_id null) and per-hotel overrides. A hotel's own effective rate
// is readable by that hotel's own manager/owner (requireHotelAccess, below); only ADMIN may add a new
// rate row anywhere -- an admin-level pricing lever, same policy as /coupons and /settings' PATCH.
adminRouter.get('/commission-config', commissionConfigController.getGlobal);
adminRouter.put('/commission-config', validate({ body: commissionRateSchema }), authorize('ADMIN'), commissionConfigController.setGlobal);
adminRouter.get(
  '/hotels/:id/commission',
  validate({ params: idParam }),
  requireHotelAccess(hotelIdFromParam),
  commissionConfigController.getForHotel,
);
adminRouter.put(
  '/hotels/:id/commission',
  validate({ params: idParam, body: commissionRateSchema }),
  authorize('ADMIN'),
  commissionConfigController.setForHotel,
);

// Partner earnings / ledger. HOTEL_MANAGER/HOTEL_OWNER are scoped to their own hotels exactly like
// /bookings, /payments, /refunds below; ADMIN sees any hotel, or everything via no ?hotelId= at all.
adminRouter.get('/earnings/summary', validate({ query: earningsSummaryQuery }), ledgerController.summary);
adminRouter.get('/earnings/ledger', validate({ query: ledgerEntryListQuery }), ledgerController.entries);
adminRouter.get('/earnings/bookings/:bookingId', validate({ params: earningsBookingParam }), ledgerController.bookingDetail);

// Settlements. Creating/approving/paying/reversing a batch is a financial-operations action -- ADMIN
// only, same policy as /customers status changes and /users. Listing/detail stay staff-visible so a
// HOTEL_OWNER/HOTEL_MANAGER can see their own hotel's settlement history (scoped in the service).
adminRouter.get('/settlements', validate({ query: settlementListQuery }), settlementController.list);
adminRouter.get('/settlements/:id', validate({ params: settlementIdParam }), settlementController.detail);
adminRouter.post('/settlements', validate({ body: settlementCreateSchema }), authorize('ADMIN'), settlementController.create);
adminRouter.post('/settlements/:id/approve', validate({ params: settlementIdParam }), authorize('ADMIN'), settlementController.approve);
adminRouter.post(
  '/settlements/:id/mark-paid',
  validate({ params: settlementIdParam, body: settlementMarkPaidSchema }),
  authorize('ADMIN'),
  settlementController.markPaid,
);
adminRouter.post(
  '/settlements/:id/reverse',
  validate({ params: settlementIdParam, body: settlementReverseSchema }),
  authorize('ADMIN'),
  settlementController.reverse,
);

adminRouter.get('/hotels', validate({ query: adminHotelListQuery }), hotelController.listAdmin);
adminRouter.get('/exports/hotels', validate({ query: adminHotelListQuery }), hotelController.exportHotelsCsv);
adminRouter.post('/hotels', validate({ body: hotelCreateSchema }), hotelController.createManual);
adminRouter.get('/hotels/:id', validate({ params: idParam }), requireHotelAccess(hotelIdFromParam), hotelController.getAdmin);
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
  requireHotelAccess(hotelIdFromParam),
  hotelController.transition,
);

// Hotel manager assignment. ADMIN only (assigning access is itself an admin-level action).
adminRouter.get(
  '/hotels/:id/managers',
  validate({ params: idParam }),
  authorize('ADMIN'),
  managerController.listForHotel,
);
adminRouter.post(
  '/hotels/:id/managers',
  validate({ params: idParam, body: managerAssignSchema }),
  authorize('ADMIN'),
  managerController.assign,
);
adminRouter.delete(
  '/hotels/:id/managers/:userId',
  validate({ params: idParam.extend({ userId: idParam.shape.id }) }),
  authorize('ADMIN'),
  managerController.unassign,
);
adminRouter.get('/managers', validate({ query: managerListQuery }), authorize('ADMIN'), managerController.listManagers);
adminRouter.get('/managers/:userId', validate({ params: managerIdParam }), authorize('ADMIN'), managerController.detail);

// Coupons / offers. ADMIN-only throughout: a platform-wide pricing lever, same policy as settings and audit logs.
adminRouter.get('/coupons', validate({ query: couponListQuery }), authorize('ADMIN'), couponController.list);
adminRouter.post('/coupons', validate({ body: couponCreateSchema }), authorize('ADMIN'), couponController.create);
adminRouter.get('/coupons/:id', validate({ params: couponIdParam }), authorize('ADMIN'), couponController.detail);
adminRouter.patch('/coupons/:id', validate({ params: couponIdParam, body: couponUpdateSchema }), authorize('ADMIN'), couponController.update);
adminRouter.patch('/coupons/:id/status', validate({ params: couponIdParam, body: couponStatusSchema }), authorize('ADMIN'), couponController.setStatus);
adminRouter.post(
  '/coupons/:id/image',
  validate({ params: couponIdParam }),
  authorize('ADMIN'),
  uploadSingleImage,
  couponController.uploadImage,
);
adminRouter.delete('/coupons/:id', validate({ params: couponIdParam }), authorize('ADMIN'), couponController.remove);

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
  requireHotelAccess(hotelIdFromParam),
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

// Room types, room images and room amenities. ADMIN and HOTEL_MANAGER only (see staff guard above).
adminRouter.get(
  '/hotels/:id/room-types',
  validate({ params: idParam, query: roomTypeListQuery }),
  requireHotelAccess(hotelIdFromParam),
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
adminRouter.get('/room-types/:id', validate({ params: roomParam }), requireHotelAccess(hotelIdFromRoomType), inv.getRoomType);
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
  requireHotelAccess(hotelIdFromParam),
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
adminRouter.get('/room-types/:id/rate-plans', validate({ params: roomParam }), requireHotelAccess(hotelIdFromRoomType), inv.listRatePlans);
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
  requireHotelAccess(hotelIdFromRoomType),
  inv.calendar,
);
adminRouter.post(
  '/room-types/:id/calendar/bulk',
  validate({ params: roomParam, body: bulkCalendarSchema }),
  requireHotelAccess(hotelIdFromRoomType),
  inv.bulkCalendar,
);

// Maintenance and owner blocks
adminRouter.get('/room-types/:id/blocks', validate({ params: roomParam }), requireHotelAccess(hotelIdFromRoomType), inv.listBlocks);
adminRouter.post(
  '/room-types/:id/blocks',
  validate({ params: roomParam, body: blockCreateSchema }),
  requireHotelAccess(hotelIdFromRoomType),
  inv.createBlock,
);
adminRouter.delete('/availability-blocks/:id', validate({ params: blockParam }), requireHotelAccess(hotelIdFromBlock), inv.deactivateBlock);

// Bookings, payments and refunds: platform-wide visibility. ADMIN sees everything; HOTEL_MANAGER is
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

// Customers. Platform-wide; HOTEL_MANAGER sees only customers who have booked one of its hotels.
adminRouter.get('/customers', validate({ query: adminCustomerListQuery }), adminCustomerController.list);
adminRouter.get('/exports/customers', validate({ query: adminCustomerListQuery }), adminCustomerController.exportCsv);
adminRouter.get('/customers/:id', validate({ params: adminCustomerIdParam }), adminCustomerController.detail);
// Deactivating a guest account is a platform-wide, sensitive action -- ADMIN only, unlike the read routes above.
adminRouter.patch(
  '/customers/:id/status',
  validate({ params: adminCustomerIdParam, body: customerStatusSchema }),
  authorize('ADMIN'),
  adminCustomerController.setStatus,
);

// User Management: a unified, presence-aware directory across every role (customers, hotel managers,
// admins). ADMIN only -- unlike /customers, this can reveal other staff accounts, so it is not opened
// up to HOTEL_MANAGER even for read access.
adminRouter.post('/users/stream-ticket', authorize('ADMIN'), adminUserController.issueStreamTicket);
adminRouter.get('/users/kpis', authorize('ADMIN'), adminUserController.kpis);
adminRouter.get('/users', validate({ query: adminUserListQuery }), authorize('ADMIN'), adminUserController.list);
adminRouter.get('/users/:id', validate({ params: adminUserIdParam }), authorize('ADMIN'), adminUserController.detail);
adminRouter.patch(
  '/users/:id/status',
  validate({ params: adminUserIdParam, body: adminUserStatusSchema }),
  authorize('ADMIN'),
  adminUserController.setStatus,
);
adminRouter.post('/users/:id/force-signout', validate({ params: adminUserIdParam }), authorize('ADMIN'), adminUserController.forceSignOut);
adminRouter.delete(
  '/users/:id/sessions/:sessionId',
  validate({ params: adminUserSessionParam }),
  authorize('ADMIN'),
  adminUserController.revokeSession,
);

// Audit log viewer. ADMIN only — it can reveal other staff members' actions across every hotel.
adminRouter.get('/audit-logs', validate({ query: auditLogQuery }), authorize('ADMIN'), auditLogController.list);

// Reviews moderation. HOTEL_MANAGER gets read-only visibility into its own hotels (scoped in the service,
// same hotel_managers table as everything else); only ADMIN may change a review's status.
adminRouter.get('/reviews', validate({ query: adminReviewListQuery }), reviewController.listForModeration);
adminRouter.get('/exports/reviews', validate({ query: adminReviewListQuery }), reviewController.exportReviewsCsv);
adminRouter.post('/reviews/:id/moderate', validate({ params: reviewIdParam, body: moderateSchema }), authorize('ADMIN'), reviewController.moderate);

// Partner (HOTEL_OWNER) application review queue. ADMIN only -- approving a partner grants them the
// same hotel-management access as a HOTEL_MANAGER, so this is an admin-level action like /settings.
adminRouter.get('/partners', validate({ query: partnerApplicationListQuery }), authorize('ADMIN'), partnerReviewController.list);
adminRouter.get('/partners/:userId', validate({ params: partnerUserIdParam }), authorize('ADMIN'), partnerReviewController.detail);
adminRouter.post('/partners/:userId/approve', validate({ params: partnerUserIdParam }), authorize('ADMIN'), partnerReviewController.approve);
adminRouter.post(
  '/partners/:userId/reject',
  validate({ params: partnerUserIdParam, body: partnerDecisionSchema }),
  authorize('ADMIN'),
  partnerReviewController.reject,
);
adminRouter.get(
  '/partners/:userId/documents/:docId/file',
  validate({ params: partnerDocumentParam }),
  authorize('ADMIN'),
  partnerReviewController.getDocumentFile,
);
