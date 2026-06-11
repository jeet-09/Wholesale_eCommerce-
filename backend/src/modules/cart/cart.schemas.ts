import { z } from 'zod';

import { moneyStringSchema, quantityStringSchema } from '../../common/schemas';

export const cartItemResponseSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string(),
  unit: z.string(),
  quantity: quantityStringSchema,
  unitPriceSnapshot: moneyStringSchema,
  currentPrice: moneyStringSchema.nullable(),
  subtotal: moneyStringSchema,
  priceChanged: z.boolean(),
});

export const cartResponseSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  status: z.enum(['ACTIVE', 'CHECKED_OUT', 'ABANDONED']),
  items: z.array(cartItemResponseSchema),
  itemCount: z.number().int(),
  subtotal: moneyStringSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const addCartItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().positive().max(9999999),
});

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().positive().max(9999999),
});

export const cartItemParamSchema = z.object({
  itemId: z.string().uuid(),
});

export type AddCartItemInput = z.infer<typeof addCartItemSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
export type CartItemParam = z.infer<typeof cartItemParamSchema>;
