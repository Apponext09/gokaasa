import { assistantService } from '../services/assistant.service.js';

export const assistantController = {
  async status(_req, res) {
    return res.json(assistantService.status());
  },

  async extract(req, res) {
    return res.json(await assistantService.extract(req.validated.body.message));
  },
};
