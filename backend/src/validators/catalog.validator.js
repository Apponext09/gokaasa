import { z } from 'zod';

export const CATALOG_KINDS = ['property-types', 'room-categories', 'bed-types', 'image-categories', 'amenities'];
export const AMENITY_CATEGORIES = ['CONNECTIVITY', 'DINING', 'WELLNESS', 'LEISURE', 'ROOM', 'SERVICES', 'TRANSPORT', 'ACCESSIBILITY', 'OTHER'];

const code = z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,39}$/, 'Use 2-40 letters, digits and underscores');
const base = {
  code: code.optional(),
  name: z.string().trim().min(2).max(80),
  sortOrder: z.number().int().min(0).max(10000).default(0),
};
const sortOrder = z.number().int().min(0).max(10000);

export const catalogKindParam = z.object({ kind: z.enum(CATALOG_KINDS) });
export const catalogItemParam = z.object({ kind: z.enum(CATALOG_KINDS), code });
export const catalogCreateSchema = z.object({ ...base, category: z.enum(AMENITY_CATEGORIES).optional() });
export const catalogUpdateSchema = z.object({
  name: base.name.optional(),
  category: z.enum(AMENITY_CATEGORIES).optional(),
  sortOrder: sortOrder.optional(),
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update');

