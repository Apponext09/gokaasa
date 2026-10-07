import { Router } from 'express';
import { hotelController } from '../controllers/hotel.controller.js';
import { hotelWorkspaceController } from '../controllers/hotelWorkspace.controller.js';
import { roomInventoryController as inv } from '../controllers/roomInventory.controller.js';
import { authenticate, authorize } from '../middleware/authenticate.js';
import { importSearchLimiter } from '../middleware/rateLimiters.js';
import { uploadSingleImage } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import {
  adminHotelListQuery,
  hotelAmenitiesSchema,
  hotelCreateSchema,
  hotelStatusSchema,
  hotelUpdateSchema,
  idParam,
} from '../validators/hotel.validator.js';
import { importCreateSchema, importJobsQuery, importSearchSchema } from '../validators/hotelImport.validator.js';
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

/**
 * Everything under /api/admin requires an authenticated staff member. Individual actions narrow this
 * further where needed (publication actions are ADMIN-only inside the service).
 */
export const adminRouter = Router();

const staff = [authenticate, authorize('ADMIN', 'HOTEL_MANAGER')];
adminRouter.use(staff);

adminRouter.get('/dashboard/summary', hotelController.dashboard);

adminRouter.get('/hotels', validate({ query: adminHotelListQuery }), hotelController.listAdmin);
adminRouter.post('/hotels', validate({ body: hotelCreateSchema }), hotelController.createManual);
adminRouter.get('/hotels/:id', validate({ params: idParam }), hotelController.getAdmin);
adminRouter.patch('/hotels/:id', validate({ params: idParam, body: hotelUpdateSchema }), hotelController.update);
adminRouter.put('/hotels/:id/amenities', validate({ params: idParam, body: hotelAmenitiesSchema }), hotelController.setAmenities);
adminRouter.post('/hotels/:id/status', validate({ params: idParam, body: hotelStatusSchema }), hotelController.transition);

// Verification and provider reconciliation
adminRouter.post('/hotels/:id/verify-fields', validate({ params: idParam, body: verifyFieldsSchema }), hotelWorkspaceController.verifyFields);
adminRouter.post('/hotels/:id/sync-external', validate({ params: idParam }), hotelWorkspaceController.syncExternal);
adminRouter.post(
  '/hotels/:id/fields/:field/accept-suggestion',
  validate({ params: fieldParam }),
  hotelWorkspaceController.acceptSuggestion,
);
adminRouter.post(
  '/hotels/:id/fields/:field/dismiss-suggestion',
  validate({ params: fieldParam }),
  hotelWorkspaceController.dismissSuggestion,
);

// Images. Uploads are authenticated (staff only) and validated by content, not by client-supplied type.
adminRouter.get('/hotels/:id/images', validate({ params: idParam }), hotelWorkspaceController.listImages);
adminRouter.post(
  '/hotels/:id/images',
  validate({ params: idParam }),
  uploadSingleImage,
  validate({ body: imageUploadFields }),
  hotelWorkspaceController.uploadImage,
);
adminRouter.post(
  '/hotels/:id/images/from-provider',
  validate({ params: idParam, body: providerImageSchema }),
  hotelWorkspaceController.addProviderImage,
);
adminRouter.put('/hotels/:id/images/order', validate({ params: idParam, body: imageOrderSchema }), hotelWorkspaceController.reorderImages);
adminRouter.patch('/hotels/:id/images/:imageId', validate({ params: imageParam, body: imagePatchSchema }), hotelWorkspaceController.updateImage);
adminRouter.post('/hotels/:id/images/:imageId/cover', validate({ params: imageParam }), hotelWorkspaceController.setCover);
adminRouter.delete('/hotels/:id/images/:imageId', validate({ params: imageParam }), hotelWorkspaceController.removeImage);

adminRouter.get('/hotels/:id/import-history', validate({ params: idParam }), hotelWorkspaceController.importHistory);

// Hotel onboarding (provider search and import jobs)
adminRouter.post(
  '/hotel-import/search',
  importSearchLimiter,
  validate({ body: importSearchSchema }),
  hotelController.importSearch,
);
adminRouter.post('/hotel-import/import', validate({ body: importCreateSchema }), hotelController.importRequest);
adminRouter.get('/hotel-import/jobs', validate({ query: importJobsQuery }), hotelController.importJobs);
adminRouter.get('/hotel-import/jobs/:id', validate({ params: idParam }), hotelController.importJob);
adminRouter.get('/hotel-import/jobs/:id/review', validate({ params: idParam }), hotelWorkspaceController.importReview);
adminRouter.post('/hotel-import/jobs/:id/discard', validate({ params: idParam }), hotelWorkspaceController.discardImport);
adminRouter.get('/hotel-import/providers', hotelController.providers);

// Room types, room images and room amenities. ADMIN and HOTEL_MANAGER only (see staff guard above).
adminRouter.get('/hotels/:id/room-types', validate({ params: idParam, query: roomTypeListQuery }), inv.listRoomTypes);
adminRouter.post('/hotels/:id/room-types', validate({ params: idParam, body: roomTypeCreateSchema }), inv.createRoomType);
adminRouter.get('/room-types/:id', validate({ params: roomParam }), inv.getRoomType);
adminRouter.patch('/room-types/:id', validate({ params: roomParam, body: roomTypeUpdateSchema }), inv.updateRoomType);
adminRouter.post('/room-types/:id/archive', validate({ params: roomParam }), inv.archiveRoomType);
adminRouter.put('/room-types/:id/amenities', validate({ params: roomParam, body: hotelAmenitiesSchema }), inv.setRoomAmenities);
adminRouter.post('/room-types/:id/images', validate({ params: roomParam }), uploadSingleImage, inv.uploadRoomImage);
adminRouter.delete('/room-types/:id/images/:imageId', validate({ params: roomImageParam }), inv.removeRoomImage);
adminRouter.post('/room-types/:id/images/:imageId/cover', validate({ params: roomImageParam }), inv.setRoomCover);
adminRouter.put('/room-types/:id/images/order', validate({ params: roomParam, body: roomImageReorderSchema }), inv.reorderRoomImages);

// Cancellation policies (reusable per hotel)
adminRouter.get('/hotels/:id/cancellation-policies', validate({ params: idParam }), inv.listPolicies);
adminRouter.post('/hotels/:id/cancellation-policies', validate({ params: idParam, body: policyCreateSchema }), inv.createPolicy);
adminRouter.patch('/cancellation-policies/:id', validate({ params: policyParam, body: policyUpdateSchema }), inv.updatePolicy);
adminRouter.post('/cancellation-policies/:id/archive', validate({ params: policyParam }), inv.archivePolicy);

// Rate plans
adminRouter.get('/room-types/:id/rate-plans', validate({ params: roomParam }), inv.listRatePlans);
adminRouter.post('/room-types/:id/rate-plans', validate({ params: roomParam, body: ratePlanCreateSchema }), inv.createRatePlan);
adminRouter.patch('/rate-plans/:id', validate({ params: policyParam, body: ratePlanUpdateSchema }), inv.updateRatePlan);

// Rate calendar, bulk pricing and inventory settings
adminRouter.get('/room-types/:id/calendar', validate({ params: roomParam, query: calendarQuery }), inv.calendar);
adminRouter.post('/room-types/:id/calendar/bulk', validate({ params: roomParam, body: bulkCalendarSchema }), inv.bulkCalendar);

// Maintenance and owner blocks
adminRouter.get('/room-types/:id/blocks', validate({ params: roomParam }), inv.listBlocks);
adminRouter.post('/room-types/:id/blocks', validate({ params: roomParam, body: blockCreateSchema }), inv.createBlock);
adminRouter.delete('/availability-blocks/:id', validate({ params: blockParam }), inv.deactivateBlock);
