import { Router } from 'express';
import { authRouter } from './auth.routes.js';
import { adminRouter } from './admin.routes.js';
import { amenityRouter, hotelRouter } from './hotel.routes.js';
import { destinationRouter, wishlistRouter } from './discovery.routes.js';
import { bookingRouter, bookingsRouter, myBookingsRouter, paymentRouter } from './booking.routes.js';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/hotels', hotelRouter);
apiRouter.use('/amenities', amenityRouter);
apiRouter.use('/destinations', destinationRouter);
apiRouter.use('/wishlist', wishlistRouter);
apiRouter.use('/booking', bookingRouter);
apiRouter.use('/bookings', bookingsRouter);
apiRouter.use('/my-bookings', myBookingsRouter);
apiRouter.use('/payments', paymentRouter);
apiRouter.use('/admin', adminRouter);
