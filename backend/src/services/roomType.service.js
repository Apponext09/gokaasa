import { withTransaction, pool } from '../db/pool.js';
import { hotelRepository } from '../repositories/hotel.repository.js';
import { roomTypeRepository } from '../repositories/roomType.repository.js';
import { ratePlanRepository } from '../repositories/ratePlan.repository.js';
import { cancellationPolicyRepository } from '../repositories/cancellationPolicy.repository.js';
import { inventoryRepository } from '../repositories/inventory.repository.js';
import { auditService } from './audit.service.js';
import { loadNightly } from './inventory.service.js';
import { getStorage } from '../storage/index.js';
import { describePolicy } from '../domain/cancellationPolicy.js';
import { addDays } from '../domain/pricing.js';
import { AppError } from '../utils/AppError.js';

// camelCase input -> snake_case column
const COLUMN_FOR = {
  name: 'name',
  roomCode: 'room_code',
  category: 'category',
  description: 'description',
  roomSizeSqm: 'room_size_sqm',
  bedType: 'bed_type',
  bedCount: 'bed_count',
  maxAdults: 'max_adults',
  maxChildren: 'max_children',
  maxOccupancy: 'max_occupancy',
  view: 'view',
  smoking: 'smoking',
  totalUnits: 'total_units',
  cancellationPolicyId: 'cancellation_policy_id',
  status: 'status',
};

const MAX_FUTURE_NIGHTS = 365;

function toColumns(input) {
  const columns = {};
  for (const [key, column] of Object.entries(COLUMN_FOR)) {
    if (input[key] !== undefined) columns[column] = input[key];
  }
  return columns;
}

function toRoomSummary(row) {
  return {
    id: row.id,
    roomCode: row.room_code,
    name: row.name,
    category: row.category,
    status: row.status,
    maxAdults: row.max_adults,
    maxChildren: row.max_children,
    maxOccupancy: row.max_occupancy,
    bedType: row.bed_type,
    bedCount: row.bed_count,
    roomSizeSqm: row.room_size_sqm == null ? null : Number(row.room_size_sqm),
    view: row.view,
    smoking: row.smoking,
    totalUnits: row.total_units,
    cancellationPolicyId: row.cancellation_policy_id,
    fromPriceMinor: row.from_price_minor == null ? null : Number(row.from_price_minor),
    imageCount: row.image_count ?? 0,
    archivedAt: row.archived_at,
    updatedAt: row.updated_at,
  };
}

export function toRatePlanDto(row, policy = null) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    mealPlan: row.meal_plan,
    isRefundable: row.is_refundable,
    cancellationPolicyId: row.cancellation_policy_id,
    cancellationPolicy: policy ? toPolicyDto(policy) : null,
    currency: row.currency,
    discountPercent: Number(row.discount_percent),
    taxPercent: Number(row.tax_percent),
    feeMinor: row.fee_minor,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export function toPolicyDto(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    summary: describePolicy(row),
    isNonRefundable: row.is_non_refundable,
    cancellationDeadlineHours: row.cancellation_deadline_hours,
    refundPercent: row.refund_percent,
    status: row.status,
  };
}

async function requireHotel(hotelId, client = pool) {
  const hotel = await hotelRepository.findById(hotelId, { client });
  if (!hotel) throw AppError.notFound('Hotel not found');
  if (hotel.status === 'ARCHIVED') throw AppError.conflict('Archived hotels are read-only');
  return hotel;
}

async function requirePolicyForHotel(policyId, hotelId, client) {
  if (policyId == null) return;
  const policy = await cancellationPolicyRepository.findById(policyId, client);
  if (!policy || policy.hotel_id !== hotelId) {
    throw AppError.unprocessable('Choose a cancellation policy from this hotel', [{ field: 'cancellationPolicyId', message: 'Unknown policy' }]);
  }
}

export const roomTypeService = {
  async listForHotel(hotelId, { includeArchived = false } = {}) {
    if (!(await hotelRepository.findById(hotelId))) throw AppError.notFound('Hotel not found');
    const rows = await roomTypeRepository.listForHotel(hotelId, { includeArchived });
    return rows.map(toRoomSummary);
  },

  async getDetail(roomTypeId) {
    const room = await roomTypeRepository.findById(roomTypeId);
    if (!room) throw AppError.notFound('Room type not found');
    const [amenities, images, plans, policies] = await Promise.all([
      roomTypeRepository.listAmenities(roomTypeId),
      roomTypeRepository.listImages(roomTypeId),
      ratePlanRepository.listForRoomType(roomTypeId),
      cancellationPolicyRepository.listForHotel(room.hotel_id),
    ]);
    const policyById = new Map(policies.map((policy) => [policy.id, policy]));
    return {
      ...toRoomSummary({ ...room, image_count: images.length }),
      description: room.description,
      hotelId: room.hotel_id,
      amenities,
      images: images.map((image) => ({
        id: image.id,
        url: getStorage().publicUrl(image.storage_key),
        altText: image.alt_text,
        sortOrder: image.sort_order,
        isCover: image.is_cover,
        mimeType: image.mime_type,
        byteSize: image.byte_size,
      })),
      ratePlans: plans.map((plan) => toRatePlanDto(plan, policyById.get(plan.cancellation_policy_id) ?? null)),
    };
  },

  async create(hotelId, input, actor) {
    return withTransaction(async (client) => {
      await requireHotel(hotelId, client);
      if (await roomTypeRepository.existsCode(hotelId, input.roomCode, null, client)) {
        throw AppError.conflict('Another room in this hotel already uses that room code', { field: 'roomCode' });
      }
      if (await roomTypeRepository.existsName(hotelId, input.name, null, client)) {
        throw AppError.conflict('A room with this name already exists in this hotel', { field: 'name' });
      }
      await requirePolicyForHotel(input.cancellationPolicyId, hotelId, client);

      const id = await roomTypeRepository.insert(client, { hotel_id: hotelId, ...toColumns(input) });
      await auditService.record(client, {
        actor,
        action: 'room_type.created',
        entity: 'room_type',
        entityId: id,
        newValue: { hotelId, name: input.name, roomCode: input.roomCode },
      });
      return id;
    }).then((id) => this.getDetail(id));
  },

  async update(roomTypeId, input, actor) {
    await withTransaction(async (client) => {
      const room = await roomTypeRepository.lockById(roomTypeId, client);
      if (!room) throw AppError.notFound('Room type not found');
      if (room.status === 'ARCHIVED') throw AppError.conflict('Archived room types are read-only');
      const current = await roomTypeRepository.findById(roomTypeId, client);

      if (input.roomCode && input.roomCode !== current.room_code &&
        (await roomTypeRepository.existsCode(room.hotel_id, input.roomCode, roomTypeId, client))) {
        throw AppError.conflict('Another room in this hotel already uses that room code', { field: 'roomCode' });
      }
      if (input.name && input.name.toLowerCase() !== current.name.toLowerCase() &&
        (await roomTypeRepository.existsName(room.hotel_id, input.name, roomTypeId, client))) {
        throw AppError.conflict('A room with this name already exists in this hotel', { field: 'name' });
      }
      if (input.status === 'ARCHIVED') throw AppError.unprocessable('Use the archive action to retire a room type');

      // Check occupancy on the merged values; a partial PATCH can contradict the stored limits.
      const adults = input.maxAdults ?? current.max_adults;
      const children = input.maxChildren ?? current.max_children;
      const occupancy = input.maxOccupancy ?? current.max_occupancy;
      if (occupancy < adults || occupancy > adults + children) {
        throw AppError.unprocessable('Maximum occupancy must be between adults and adults + children', [
          { field: 'maxOccupancy', message: `Use a value from ${adults} to ${adults + children}` },
        ]);
      }
      await requirePolicyForHotel(input.cancellationPolicyId, room.hotel_id, client);

      // Stock may not drop below rooms already blocked or reserved on any future night.
      if (input.totalUnits !== undefined && input.totalUnits < current.total_units) {
        const nights = Array.from({ length: MAX_FUTURE_NIGHTS }, (_, i) => addDays(new Date().toISOString().slice(0, 10), i));
        const nightly = await loadNightly(client, [roomTypeId], nights);
        for (const [key, facts] of nightly) {
          if (input.totalUnits < facts.blocked + facts.reserved && facts.unitsOverride == null) {
            throw AppError.conflict('Fewer rooms than are already reserved or blocked on upcoming nights', {
              night: key.split('|')[1],
              reserved: facts.reserved,
              blocked: facts.blocked,
            });
          }
        }
      }

      const changes = toColumns(input);
      const oldValue = {};
      const newValue = {};
      for (const [column, value] of Object.entries(changes)) {
        if (String(current[column] ?? '') !== String(value ?? '')) {
          oldValue[column] = current[column] ?? null;
          newValue[column] = value ?? null;
        }
      }
      if (Object.keys(newValue).length > 0) {
        await roomTypeRepository.update(client, roomTypeId, newValue);
        await auditService.record(client, {
          actor,
          action: 'room_type.updated',
          entity: 'room_type',
          entityId: roomTypeId,
          oldValue,
          newValue,
        });
      }
    });
    return this.getDetail(roomTypeId);
  },

  /** Archive keeps history. Upcoming reservations block the archive so no guest is left without a room. */
  async archive(roomTypeId, actor) {
    await withTransaction(async (client) => {
      const room = await roomTypeRepository.lockById(roomTypeId, client);
      if (!room) throw AppError.notFound('Room type not found');
      if (room.status === 'ARCHIVED') throw AppError.conflict('This room type is already archived');
      const future = await inventoryRepository.futureReservationCount(roomTypeId, new Date().toISOString().slice(0, 10), client);
      if (future > 0) throw AppError.conflict('This room type has upcoming reservations. Deactivate it instead, or resolve those stays first.');
      await roomTypeRepository.archive(client, roomTypeId);
      await auditService.record(client, {
        actor,
        action: 'room_type.archived',
        entity: 'room_type',
        entityId: roomTypeId,
        oldValue: { status: room.status },
        newValue: { status: 'ARCHIVED' },
      });
    });
    return this.getDetail(roomTypeId);
  },

  async setAmenities(roomTypeId, codes, actor) {
    await withTransaction(async (client) => {
      const room = await roomTypeRepository.lockById(roomTypeId, client);
      if (!room) throw AppError.notFound('Room type not found');
      const unique = [...new Set(codes)];
      const found = await hotelRepository.findAmenityIdsByCodes(client, unique);
      const unknown = unique.filter((code) => !found.some((row) => row.code === code));
      if (unknown.length > 0) throw AppError.unprocessable('Some amenities are not recognised', unknown.map((code) => ({ field: 'codes', message: `Unknown amenity ${code}` })));
      const before = (await roomTypeRepository.listAmenities(roomTypeId, client)).map((a) => a.code).sort();
      await roomTypeRepository.replaceAmenities(client, roomTypeId, found.map((row) => row.id));
      await auditService.record(client, {
        actor,
        action: 'room_type.amenities_changed',
        entity: 'room_type',
        entityId: roomTypeId,
        oldValue: { amenities: before },
        newValue: { amenities: [...unique].sort() },
      });
    });
    return this.getDetail(roomTypeId);
  },

};
