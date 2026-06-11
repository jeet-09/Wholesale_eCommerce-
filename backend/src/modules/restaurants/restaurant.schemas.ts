import { z } from 'zod';

import { moneyStringSchema } from '../../common/schemas';
import { paginationQuerySchema } from '../../common/pagination';

const PROFILE_STATUSES = ['PENDING', 'ACTIVE', 'SUSPENDED'] as const;

export const restaurantResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  restaurantName: z.string(),
  licenseNumber: z.string().nullable(),
  cuisineType: z.string().nullable(),
  averageMonthlyProcurement: moneyStringSchema.nullable(),
  status: z.enum(PROFILE_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const updateRestaurantSchema = z
  .object({
    restaurantName: z.string().trim().min(1).max(200).optional(),
    licenseNumber: z.string().trim().min(1).max(100).nullable().optional(),
    cuisineType: z.string().trim().min(1).max(100).nullable().optional(),
    averageMonthlyProcurement: z.coerce.number().nonnegative().nullable().optional(),
    status: z.enum(PROFILE_STATUSES).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export const listRestaurantsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(PROFILE_STATUSES).optional(),
  search: z.string().trim().min(1).max(100).optional(),
});

export type UpdateRestaurantInput = z.infer<typeof updateRestaurantSchema>;
export type ListRestaurantsQueryInput = z.infer<typeof listRestaurantsQuerySchema>;
