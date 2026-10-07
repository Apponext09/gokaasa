import { Router } from 'express';
import { hotelController } from '../controllers/hotel.controller.js';
import { validate } from '../middleware/validate.js';
import { hotelRefParam, publicHotelListQuery } from '../validators/hotel.validator.js';
import { availabilityQuery } from '../validators/inventory.validator.js';
import { hotelSearchQuery } from '../validators/hotelSearch.validator.js';
import { searchController } from '../controllers/search.controller.js';
import { optionalAuthenticate } from '../middleware/authenticate.js';
import { roomInventoryController } from '../controllers/roomInventory.controller.js';
import { reviewController } from '../controllers/review.controller.js';
import { hotelReviewsQuery } from '../validators/review.validator.js';

/** Customer-facing, published-only hotel routes. */
export const hotelRouter = Router();
hotelRouter.get('/', validate({ query: publicHotelListQuery }), hotelController.listPublic);
// Must come before '/:idOrSlug', otherwise "search" would be read as a hotel slug.
hotelRouter.get('/search', optionalAuthenticate, validate({ query: hotelSearchQuery }), searchController.search);
hotelRouter.get('/:idOrSlug', optionalAuthenticate, validate({ params: hotelRefParam }), hotelController.getPublic);
// Customer availability. Published hotels and active room types only; every figure is derived on the server.
hotelRouter.get(
  '/:idOrSlug/availability',
  validate({ params: hotelRefParam, query: availabilityQuery }),
  roomInventoryController.publicAvailability,
);
// Approved reviews and the rating summary. Published hotels only (findById's publicOnly check).
hotelRouter.get('/:idOrSlug/reviews', validate({ params: hotelRefParam, query: hotelReviewsQuery }), reviewController.forHotel);

export const amenityRouter = Router();
amenityRouter.get('/', hotelController.listAmenities);
