import { z } from 'zod';
import { TRACKED_FIELDS } from '../domain/fieldProvenance.js';
import { IMAGE_CATEGORIES } from '../services/hotelImage.service.js';

const trackedField = z.enum(TRACKED_FIELDS);

export const verifyFieldsSchema = z.object({
  fields: z.array(trackedField).min(1, 'Choose at least one field').max(TRACKED_FIELDS.length),
});

export const fieldParam = z.object({
  id: z.string().regex(/^\d+$/, 'Invalid id').transform(Number),
  field: trackedField,
});

export const imageParam = z.object({
  id: z.string().regex(/^\d+$/, 'Invalid id').transform(Number),
  imageId: z.string().regex(/^\d+$/, 'Invalid image id').transform(Number),
});

export const imagePatchSchema = z
  .object({
    category: z.enum(IMAGE_CATEGORIES).optional(),
    altText: z.string().trim().max(200).nullish().transform((value) => value || null),
  })
  .refine((value) => value.category !== undefined || value.altText !== undefined, 'Provide a category or alt text');

export const imageOrderSchema = z.object({
  imageIds: z.array(z.number().int().positive()).min(1).max(30),
});

export const imageUploadFields = z.object({
  category: z.enum(IMAGE_CATEGORIES).default('OTHER'),
  altText: z.string().trim().max(200).optional().transform((value) => value || null),
});

export const providerImageSchema = z.object({
  sourceUrl: z.url({ message: 'Provide the image URL from the provider record' }).max(2000),
});
