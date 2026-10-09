import { hotelService } from '../services/hotel.service.js';
import { hotelSyncService } from '../services/hotelSync.service.js';
import { hotelImageService } from '../services/hotelImage.service.js';
import { hotelImportService } from '../services/hotelImport.service.js';
import { AppError } from '../utils/AppError.js';

function actorOf(req) {
  return { id: req.user.id, roles: req.user.roles, ip: req.ip };
}

/** Verification, provider sync, image management and import review for the hotel workspace. */
export const hotelWorkspaceController = {
  async verifyFields(req, res) {
    const hotel = await hotelService.verifyFields(req.validated.params.id, req.validated.body.fields, actorOf(req));
    return res.json({ hotel });
  },

  async syncExternal(req, res) {
    return res.json(await hotelSyncService.syncFromProvider(req.validated.params.id, actorOf(req)));
  },

  async acceptSuggestion(req, res) {
    const hotel = await hotelSyncService.acceptSuggestion(req.validated.params.id, req.validated.params.field, actorOf(req));
    return res.json({ hotel });
  },

  async dismissSuggestion(req, res) {
    const hotel = await hotelSyncService.dismissSuggestion(req.validated.params.id, req.validated.params.field, actorOf(req));
    return res.json({ hotel });
  },

  async listImages(req, res) {
    return res.json({ images: await hotelImageService.list(req.validated.params.id) });
  },

  async uploadImage(req, res) {
    if (!req.file) throw AppError.badRequest('Choose an image to upload');
    const image = await hotelImageService.upload(req.validated.params.id, req.file, req.validated.body, actorOf(req));
    return res.status(201).json({ image });
  },

  async addProviderImage(req, res) {
    const image = await hotelImageService.addFromProvider(req.validated.params.id, req.validated.body.sourceUrl, actorOf(req));
    return res.status(201).json({ image });
  },

  async addImageFromUrl(req, res) {
    const image = await hotelImageService.addFromUrl(req.validated.params.id, req.validated.body, actorOf(req));
    return res.status(201).json({ image });
  },

  async updateImage(req, res) {
    const image = await hotelImageService.updateDetails(
      req.validated.params.id,
      req.validated.params.imageId,
      req.validated.body,
      actorOf(req),
    );
    return res.json({ image });
  },

  async setCover(req, res) {
    const image = await hotelImageService.setCover(req.validated.params.id, req.validated.params.imageId, actorOf(req));
    return res.json({ image });
  },

  async reorderImages(req, res) {
    const images = await hotelImageService.reorder(req.validated.params.id, req.validated.body.imageIds, actorOf(req));
    return res.json({ images });
  },

  async removeImage(req, res) {
    await hotelImageService.remove(req.validated.params.id, req.validated.params.imageId, actorOf(req));
    return res.status(204).end();
  },

  async importReview(req, res) {
    return res.json(await hotelImportService.getReview(req.validated.params.id));
  },

  async discardImport(req, res) {
    const job = await hotelImportService.discard(req.validated.params.id, actorOf(req));
    return res.json({ job });
  },

  async importHistory(req, res) {
    const hotel = await hotelService.getAdmin(req.validated.params.id);
    const jobs = await hotelImportService.historyForHotel(hotel);
    return res.json({ jobs });
  },
};
