import { Router } from 'express';
import { bookingController } from '../controllers/booking.controller.js';
import { paymentController } from '../controllers/payment.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import {
  bookingIdParam,
  cancelSchema,
  createOrderSchema,
  devCheckoutSchema,
  failedPaymentSchema,
  guestDetailsSchema,
  holdCreateSchema,
  holdIdParam,
  myBookingsQuery,
  verifySchema,
} from '../validators/booking.validator.js';

/** Holds: the temporary claim on rooms while a guest completes a booking. Mounted at /api/booking. */
export const bookingRouter = Router();
bookingRouter.use(authenticate);
bookingRouter.get('/holds/active', bookingController.activeHold);
bookingRouter.post('/holds', validate({ body: holdCreateSchema }), bookingController.createHold);
bookingRouter.get('/holds/:id', validate({ params: holdIdParam }), bookingController.getHold);
bookingRouter.put('/holds/:id/guests', validate({ params: holdIdParam, body: guestDetailsSchema }), bookingController.saveGuests);
bookingRouter.post('/holds/:id/requote', validate({ params: holdIdParam }), bookingController.requote);
bookingRouter.post('/holds/:id/release', validate({ params: holdIdParam }), bookingController.releaseHold);

/** One booking, owner only. Mounted at /api/bookings. */
export const bookingsRouter = Router();
bookingsRouter.use(authenticate);
bookingsRouter.get('/:id', validate({ params: bookingIdParam }), bookingController.getBooking);
bookingsRouter.get('/:id/cancellation-preview', validate({ params: bookingIdParam }), bookingController.cancellationPreview);
bookingsRouter.post('/:id/cancel', validate({ params: bookingIdParam, body: cancelSchema }), bookingController.cancelBooking);

/** My Trips list and details. Mounted at /api/my-bookings. */
export const myBookingsRouter = Router();
myBookingsRouter.use(authenticate);
myBookingsRouter.get('/', validate({ query: myBookingsQuery }), bookingController.listMyBookings);
myBookingsRouter.get('/:id', validate({ params: bookingIdParam }), bookingController.getBooking);

/**
 * Payments. Mounted at /api/payments. The webhook is registered separately in app.js, before the JSON parser.
 * Only the public key id is returned by /config.
 */
export const paymentRouter = Router();
paymentRouter.get('/config', paymentController.config);
paymentRouter.post('/create-order', authenticate, validate({ body: createOrderSchema }), paymentController.createOrder);
paymentRouter.post('/verify', authenticate, validate({ body: verifySchema }), paymentController.verify);
paymentRouter.post('/failed', authenticate, validate({ body: failedPaymentSchema }), paymentController.reportFailure);
paymentRouter.post('/dev/checkout', authenticate, validate({ body: devCheckoutSchema }), paymentController.devCheckout);
