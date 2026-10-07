import { roomTypeService } from '../services/roomType.service.js';
import { roomImageService } from '../services/roomImage.service.js';
import { ratePlanService } from '../services/ratePlan.service.js';
import { cancellationPolicyService } from '../services/cancellationPolicy.service.js';
import { inventoryService } from '../services/inventory.service.js';
import { availabilityService } from '../services/availability.service.js';
import { hotelService } from '../services/hotel.service.js';
import { AppError } from '../utils/AppError.js';

function actorOf(req) {
  return { id: req.user.id, roles: req.user.roles, ip: req.ip };
}

/** Room types, room images, rate plans, cancellation policies, the rate calendar, blocks, and public availability. */
export const roomInventoryController = {
  // Room types
  async listRoomTypes(req, res) {
    await hotelService.getAdmin(req.validated.params.id); // 404 for unknown hotels
    const rooms = await roomTypeService.listForHotel(req.validated.params.id, req.validated.query);
    return res.json({ roomTypes: rooms });
  },

  async createRoomType(req, res) {
    const roomType = await roomTypeService.create(req.validated.params.id, req.validated.body, actorOf(req));
    return res.status(201).json({ roomType });
  },

  async getRoomType(req, res) {
    return res.json({ roomType: await roomTypeService.getDetail(req.validated.params.id) });
  },

  async updateRoomType(req, res) {
    return res.json({ roomType: await roomTypeService.update(req.validated.params.id, req.validated.body, actorOf(req)) });
  },

  async archiveRoomType(req, res) {
    return res.json({ roomType: await roomTypeService.archive(req.validated.params.id, actorOf(req)) });
  },

  async setRoomAmenities(req, res) {
    return res.json({ roomType: await roomTypeService.setAmenities(req.validated.params.id, req.validated.body.codes, actorOf(req)) });
  },

  // Room images (same storage and validation as hotel images)
  async uploadRoomImage(req, res) {
    if (!req.file) throw AppError.badRequest('Choose an image to upload');
    const image = await roomImageService.upload(req.validated.params.id, req.file, actorOf(req));
    return res.status(201).json({ image });
  },

  async removeRoomImage(req, res) {
    await roomImageService.remove(req.validated.params.id, req.validated.params.imageId, actorOf(req));
    return res.status(204).end();
  },

  async setRoomCover(req, res) {
    return res.json({ images: await roomImageService.setCover(req.validated.params.id, req.validated.params.imageId, actorOf(req)) });
  },

  async reorderRoomImages(req, res) {
    return res.json({ images: await roomImageService.reorder(req.validated.params.id, req.validated.body.imageIds, actorOf(req)) });
  },

  // Cancellation policies
  async listPolicies(req, res) {
    return res.json({ policies: await cancellationPolicyService.listForHotel(req.validated.params.id, actorOf(req)) });
  },

  async createPolicy(req, res) {
    return res.status(201).json({ policy: await cancellationPolicyService.create(req.validated.params.id, req.validated.body, actorOf(req)) });
  },

  async updatePolicy(req, res) {
    return res.json({ policy: await cancellationPolicyService.update(req.validated.params.id, req.validated.body, actorOf(req)) });
  },

  async archivePolicy(req, res) {
    await cancellationPolicyService.archive(req.validated.params.id, actorOf(req));
    return res.status(204).end();
  },

  // Rate plans
  async listRatePlans(req, res) {
    return res.json({ ratePlans: await ratePlanService.listForRoomType(req.validated.params.id) });
  },

  async createRatePlan(req, res) {
    return res.status(201).json({ ratePlan: await ratePlanService.create(req.validated.params.id, req.validated.body, actorOf(req)) });
  },

  async updateRatePlan(req, res) {
    return res.json({ ratePlan: await ratePlanService.update(req.validated.params.id, req.validated.body, actorOf(req)) });
  },

  // Rate calendar and bulk updates
  async calendar(req, res) {
    return res.json(await inventoryService.calendar(req.validated.params.id, req.validated.query));
  },

  async bulkCalendar(req, res) {
    return res.json(await inventoryService.bulkUpdate(req.validated.params.id, req.validated.body, actorOf(req)));
  },

  // Blocks
  async listBlocks(req, res) {
    return res.json({ blocks: await inventoryService.listBlocks(req.validated.params.id) });
  },

  async createBlock(req, res) {
    return res.status(201).json({ block: await inventoryService.createBlock(req.validated.params.id, req.validated.body, actorOf(req)) });
  },

  async deactivateBlock(req, res) {
    await inventoryService.deactivateBlock(req.validated.params.id, actorOf(req));
    return res.status(204).end();
  },

  // Public
  async publicAvailability(req, res) {
    return res.json(await availabilityService.search(req.validated.params.idOrSlug, req.validated.query));
  },
};
