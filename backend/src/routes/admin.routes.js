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
import { managerAssignSchema, managerListQuery } from '../validators/manager.validator.js';
import { managerController } from '../controllers/manager.controller.js';
import { adminBookingController } from '../controllers/adminBooking.controller.js';
import { adminCustomerController } from '../controllers/adminCustomer.controller.js';
import { auditLogController } from '../controllers/auditLog.controller.js';
import {
  adminBookingIdParam,
  adminBookingListQuery,
  adminPaymentListQuery,
  adminRefundListQuery,
  adminCustomerIdParam,
  adminCustomerListQuery,
  auditLogQuery,
  dashboardTrendsQuery,
} from '../validators/adminBooking.validator.js';

/**
 * Everything under /api/admin requires an authenticated staff member. Individual actions narrow this
 * further where needed: publication actions are ADMIN-only inside the service (unchanged), and
 * HOTEL_MANAGER is additionally scoped to hotels it is assigned to via `requireHotelAccess` below
 * (ADMIN always bypasses that check). A hotel a manager cannot access looks exactly like one that does
 * not exist — the same pattern already used for booking/payment ownership.
 */
export const adminRouter = Router();

const staff = [authenticate, authorize('ADMIN', 'HOTEL_MANAGER')];
adminRouter.use(staff);

adminRouter.get('/dashboard/summary', hotelController.dashboard);
adminRouter.get('/dashboard/trends', validate({ query: dashboardTrendsQuery }), hotelController.dashboardTrends);

adminRouter.get('/hotels', validate({ query: adminHotelListQuery }), hotelController.listAdmin);
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
adminRouter.get('/bookings/:id', validate({ params: adminBookingIdParam }), adminBookingController.detail);
adminRouter.post(
  '/bookings/:id/cancel',
  validate({ params: adminBookingIdParam, body: cancelSchema }),
  adminBookingController.cancel,
);
adminRouter.get('/payments', validate({ query: adminPaymentListQuery }), adminBookingController.listPayments);
adminRouter.get('/refunds', validate({ query: adminRefundListQuery }), adminBookingController.listRefunds);

// Customers. Platform-wide; HOTEL_MANAGER sees only customers who have booked one of its hotels.
adminRouter.get('/customers', validate({ query: adminCustomerListQuery }), adminCustomerController.list);
adminRouter.get('/customers/:id', validate({ params: adminCustomerIdParam }), adminCustomerController.detail);

// Audit log viewer. ADMIN only — it can reveal other staff members' actions across every hotel.
adminRouter.get('/audit-logs', validate({ query: auditLogQuery }), authorize('ADMIN'), auditLogController.list);
