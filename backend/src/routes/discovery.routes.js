import { Router } from 'express';
import { z } from 'zod';
import { searchController } from '../controllers/search.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import { destinationSuggestQuery } from '../validators/hotelSearch.validator.js';

export const destinationRouter = Router();
destinationRouter.get('/search', validate({ query: destinationSuggestQuery }), searchController.suggestDestinations);
destinationRouter.get('/popular', searchController.popularDestinations);

export const wishlistRouter = Router();
wishlistRouter.use(authenticate);
wishlistRouter.get('/', searchController.listWishlist);
wishlistRouter.post('/', validate({ body: z.object({ hotelId: z.coerce.number().int().positive() }) }), searchController.addWishlist);
wishlistRouter.delete(
  '/:hotelId',
  validate({ params: z.object({ hotelId: z.coerce.number().int().positive() }) }),
  searchController.removeWishlist,
);
