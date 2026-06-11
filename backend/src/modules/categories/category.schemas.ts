import { z } from 'zod';

import { paginationQuerySchema } from '../../common/pagination';

const CATEGORY_STATUSES = ['ACTIVE', 'INACTIVE'] as const;

export const categoryResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  slug: z.string(),
  parentCategoryId: z.string().uuid().nullable(),
  displayOrder: z.number().int(),
  status: z.enum(CATEGORY_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(150),
  description: z.string().trim().max(1000).optional(),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case')
    .max(80)
    .optional(),
  parentCategoryId: z.string().uuid().optional(),
  displayOrder: z.number().int().min(0).default(0),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    parentCategoryId: z.string().uuid().nullable().optional(),
    displayOrder: z.number().int().min(0).optional(),
    status: z.enum(CATEGORY_STATUSES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export const listCategoriesQuerySchema = paginationQuerySchema.extend({
  status: z.enum(CATEGORY_STATUSES).optional(),
  parentCategoryId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ListCategoriesQueryInput = z.infer<typeof listCategoriesQuerySchema>;
