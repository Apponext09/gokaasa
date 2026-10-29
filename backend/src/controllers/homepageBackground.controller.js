import { homepageBackgroundService } from '../services/homepageBackground.service.js';

const actorOf = (req) => ({ id: req.user.id, roles: req.user.roles, ip: req.ip });

export const homepageBackgroundController = {
  async list(_req, res) {
    return res.json({ images: await homepageBackgroundService.list() });
  },
  async replace(req, res) {
    const image = await homepageBackgroundService.replace(req.validated.params.slot, req.file, req.body?.altText, actorOf(req));
    return res.json({ image });
  },
  async remove(req, res) {
    await homepageBackgroundService.remove(req.validated.params.slot, actorOf(req));
    return res.status(204).end();
  },
};

