import { newsletterService } from '../services/newsletter.service.js';

export const newsletterController = {
  async subscribe(req, res) {
    return res.status(201).json(await newsletterService.subscribe(req.validated.body.email));
  },
};
