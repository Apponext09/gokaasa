import { Router } from 'express';
import { bookingController } from '../controllers/booking.controller.js';
import { paymentController } from '../controllers/payment.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import {
  bookingIdParam,
  cancelSchema,
  couponApplySchema,
  createOrderSchema,
  devCheckoutSchema,
  failedPaymentSchema,
  guestDetailsSchema,
  holdCreateSchema,
  holdIdParam,
  myBookingsQuery,
  paymentIdParam,
  refundIdParam,
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
bookingRouter.get('/holds/:id/coupons', validate({ params: holdIdParam }), bookingController.listHoldCoupons);
bookingRouter.post('/holds/:id/coupon', validate({ params: holdIdParam, body: couponApplySchema }), bookingController.applyCoupon);
bookingRouter.delete('/holds/:id/coupon', validate({ params: holdIdParam }), bookingController.removeCoupon);

/** One booking, owner only. Mounted at /api/bookings. */
export const bookingsRouter = Router();
bookingsRouter.use(authenticate);
bookingsRouter.get('/:id', validate({ params: bookingIdParam }), bookingController.getBooking);
bookingsRouter.get('/:id/cancellation-preview', validate({ params: bookingIdParam }), bookingController.cancellationPreview);
bookingsRouter.get('/:id/invoice', validate({ params: bookingIdParam }), bookingController.downloadInvoice);
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
// Registered last: a literal path above (e.g. "config") must never be shadowed by this ":id" pattern.
paymentRouter.get('/:id', authenticate, validate({ params: paymentIdParam }), paymentController.getPayment);

/** One refund, owner only. Mounted at /api/refunds. */
export const refundsRouter = Router();
refundsRouter.use(authenticate);
refundsRouter.get('/:id', validate({ params: refundIdParam }), paymentController.getRefund);
