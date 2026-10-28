import { pool } from '../db/pool.js';

const CONFIG = {
  'property-types': { table: 'property_types', hasCategory: false },
  'room-categories': { table: 'room_categories', hasCategory: false },
  'bed-types': { table: 'bed_types', hasCategory: false },
  'image-categories': { table: 'image_categories', hasCategory: false },
  'meal-plans': { table: 'meal_plans', hasCategory: false, hasMealFlags: true },
  amenities: { table: 'amenities', hasCategory: true },
};

function config(kind) {
  return CONFIG[kind];
}

export const catalogRepository = {
  async list(kind, { activeOnly = false } = {}, client = pool) {
    const { table, hasCategory, hasMealFlags } = config(kind);
    const { rows } = await client.query(
      `SELECT code, name, ${hasCategory ? 'category,' : ''}${hasMealFlags ? 'includes_breakfast, includes_lunch, includes_dinner,' : ''} is_active, sort_order, created_at, updated_at
         FROM ${table}
        ${activeOnly ? 'WHERE is_active = TRUE' : ''}
        ORDER BY sort_order, name`,
    );
    return rows;
  },

  async find(kind, code, client = pool) {
    const { table, hasCategory, hasMealFlags } = config(kind);
    const { rows } = await client.query(
      `SELECT code, name, ${hasCategory ? 'category,' : ''}${hasMealFlags ? 'includes_breakfast, includes_lunch, includes_dinner,' : ''} is_active, sort_order, created_at, updated_at FROM ${table} WHERE code = $1`,
      [code],
    );
    return rows[0] ?? null;
  },

  async nameExists(kind, name, exceptCode = null, client = pool) {
    const { table } = config(kind);
    const { rowCount } = await client.query(
      `SELECT 1 FROM ${table} WHERE lower(name) = lower($1) AND ($2::text IS NULL OR code <> $2)`,
      [name, exceptCode],
    );
    return rowCount > 0;
  },

  async insert(kind, value, client = pool) {
    const { table, hasCategory, hasMealFlags } = config(kind);
    const columns = ['code', 'name', 'sort_order', 'created_by'];
    const values = [value.code, value.name, value.sortOrder, value.createdBy];
    if (hasCategory) {
      columns.push('category');
      values.push(value.category);
    }
    if (hasMealFlags) {
      columns.push('includes_breakfast', 'includes_lunch', 'includes_dinner');
      values.push(value.includesBreakfast ?? false, value.includesLunch ?? false, value.includesDinner ?? false);
    }
    await client.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')})`,
      values,
    );
  },

  async update(kind, code, changes, client = pool) {
    const { table } = config(kind);
    const entries = Object.entries(changes);
    await client.query(
      `UPDATE ${table} SET ${entries.map(([column], index) => `${column} = $${index + 2}`).join(', ')}, updated_at = now() WHERE code = $1`,
      [code, ...entries.map(([, value]) => value)],
    );
  },
};

