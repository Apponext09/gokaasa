import { Router } from 'express';
import { reviewController } from '../controllers/review.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { bookingIdParam, reviewCreateSchema, reviewIdParam, reviewUpdateSchema } from '../validators/review.validator.js';

/** A guest's own reviews: write, read-back, edit, delete. Mounted at /api/reviews. */
export const reviewRouter = Router();
reviewRouter.use(authenticate);
reviewRouter.get('/my', reviewController.mine);
reviewRouter.get('/eligibility/:bookingId', validate({ params: bookingIdParam }), reviewController.eligibility);
reviewRouter.post('/', validate({ body: reviewCreateSchema }), reviewController.create);
reviewRouter.put('/:id', validate({ params: reviewIdParam, body: reviewUpdateSchema }), reviewController.update);
reviewRouter.delete('/:id', validate({ params: reviewIdParam }), reviewController.remove);
