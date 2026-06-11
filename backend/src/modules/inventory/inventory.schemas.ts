import { z } from 'zod';

import { quantityStringSchema } from '../../common/schemas';

export const inventoryResponseSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  availableQuantity: quantityStringSchema,
  reservedQuantity: quantityStringSchema,
  sellableQuantity: quantityStringSchema,
  minimumQuantity: quantityStringSchema,
  maximumQuantity: quantityStringSchema.nullable(),
  version: z.number().int(),
  updatedAt: z.string(),
});

export const productIdParamSchema = z.object({
  productId: z.string().uuid(),
});

export const updateInventorySchema = z
  .object({
    availableQuantity: z.coerce.number().nonnegative().optional(),
    minimumQuantity: z.coerce.number().nonnegative().optional(),
    maximumQuantity: z.coerce.number().nonnegative().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export type ProductIdParam = z.infer<typeof productIdParamSchema>;
export type UpdateInventoryInput = z.infer<typeof updateInventorySchema>;
