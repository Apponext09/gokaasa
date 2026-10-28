import { withTransaction } from '../db/pool.js';
import { catalogRepository } from '../repositories/catalog.repository.js';
import { auditService } from './audit.service.js';
import { AppError } from '../utils/AppError.js';

const dto = (row) => ({
  code: row.code,
  name: row.name,
  ...(row.category && { category: row.category }),
  ...(row.includes_breakfast !== undefined && {
    includesBreakfast: row.includes_breakfast,
    includesLunch: row.includes_lunch,
    includesDinner: row.includes_dinner,
  }),
  isActive: row.is_active,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

function makeCode(name) {
  return name.trim().toUpperCase().normalize('NFKD').replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

export const catalogService = {
  async list(kind, { activeOnly = false } = {}) {
    return (await catalogRepository.list(kind, { activeOnly })).map(dto);
  },

  async requireActive(kind, code, client) {
    const item = await catalogRepository.find(kind, code, client);
    const field = kind === 'property-types' ? 'propertyType'
      : kind === 'room-categories' || kind === 'image-categories' ? 'category'
        : kind === 'bed-types' ? 'bedType'
          : kind === 'meal-plans' ? 'mealPlan' : 'amenities';
    if (!item || !item.is_active) throw AppError.unprocessable(`Unknown or inactive ${kind.replaceAll('-', ' ')}`, [{ field, message: `${code} is not available` }]);
    return item;
  },

  async create(kind, input, actor) {
    return withTransaction(async (client) => {
      if (kind === 'amenities' && !input.category) throw AppError.unprocessable('Amenity category is required', [{ field: 'category', message: 'Choose a category' }]);
      if (kind !== 'amenities' && input.category !== undefined) throw AppError.unprocessable('Category is only valid for amenities', [{ field: 'category', message: 'Remove this field' }]);
      if (kind !== 'meal-plans' && [input.includesBreakfast, input.includesLunch, input.includesDinner].some((value) => value !== undefined)) {
        throw AppError.unprocessable('Meal inclusions are only valid for meal plans');
      }
      const code = input.code || makeCode(input.name);
      if (!/^[A-Z][A-Z0-9_]{1,39}$/.test(code)) throw AppError.unprocessable('Could not generate a valid code', [{ field: 'code', message: 'Enter a code with 2-40 letters, digits or underscores' }]);
      if (await catalogRepository.find(kind, code, client)) throw AppError.conflict('That code already exists', { field: 'code' });
      if (await catalogRepository.nameExists(kind, input.name, null, client)) throw AppError.conflict('That name already exists', { field: 'name' });
      await catalogRepository.insert(kind, { ...input, code, createdBy: actor.id }, client);
      await auditService.record(client, { actor, action: 'catalog.created', entity: kind, entityId: code, newValue: { ...input, code } });
      return dto(await catalogRepository.find(kind, code, client));
    });
  },

  async update(kind, code, input, actor) {
    return withTransaction(async (client) => {
      if (kind !== 'amenities' && input.category !== undefined) throw AppError.unprocessable('Category is only valid for amenities', [{ field: 'category', message: 'Remove this field' }]);
      if (kind !== 'meal-plans' && [input.includesBreakfast, input.includesLunch, input.includesDinner].some((value) => value !== undefined)) {
        throw AppError.unprocessable('Meal inclusions are only valid for meal plans');
      }
      if (kind === 'image-categories' && code === 'OTHER' && input.isActive === false) {
        throw AppError.unprocessable('Other is the required fallback image category', [{ field: 'isActive', message: 'OTHER must remain active' }]);
      }
      const current = await catalogRepository.find(kind, code, client);
      if (!current) throw AppError.notFound('Master value not found');
      if (kind === 'meal-plans' && input.isActive === false) {
        const activeUse = await client.query(
          `SELECT 1 FROM rate_plans WHERE meal_plan = $1 AND status = 'ACTIVE' AND deleted_at IS NULL LIMIT 1`,
          [code],
        );
        if (activeUse.rowCount) throw AppError.conflict('Deactivate or change active rate plans using this meal plan first');
        const remaining = await client.query(`SELECT COUNT(*)::int AS count FROM meal_plans WHERE is_active AND code <> $1`, [code]);
        if (remaining.rows[0].count === 0) throw AppError.conflict('At least one meal plan must remain active');
      }
      if (input.name && await catalogRepository.nameExists(kind, input.name, code, client)) throw AppError.conflict('That name already exists', { field: 'name' });
      const changes = {};
      if (input.name !== undefined) changes.name = input.name;
      if (input.category !== undefined) changes.category = input.category;
      if (input.sortOrder !== undefined) changes.sort_order = input.sortOrder;
      if (input.isActive !== undefined) changes.is_active = input.isActive;
      if (input.includesBreakfast !== undefined) changes.includes_breakfast = input.includesBreakfast;
      if (input.includesLunch !== undefined) changes.includes_lunch = input.includesLunch;
      if (input.includesDinner !== undefined) changes.includes_dinner = input.includesDinner;
      await catalogRepository.update(kind, code, changes, client);
      await auditService.record(client, { actor, action: 'catalog.updated', entity: kind, entityId: code, oldValue: dto(current), newValue: input });
      return dto(await catalogRepository.find(kind, code, client));
    });
  },
};

