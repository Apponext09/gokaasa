import { couponService } from '../services/coupon.service.js';

/** Public, unauthenticated: the customer-facing offers list. See coupon.service.js#listPublic. */
export const offerController = {
  async list(req, res) {
    return res.json({ items: await couponService.listPublic() });
  },
};
