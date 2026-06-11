import { z } from 'zod';

import { currencySchema, moneyStringSchema } from '../../common/schemas';
import { paginationQuerySchema } from '../../common/pagination';

export const priceResponseSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  price: moneyStringSchema,
  currency: currencySchema,
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  isCurrent: z.boolean(),
  createdAt: z.string(),
});

export const changePriceSchema = z.object({
  price: z.coerce.number().positive().max(99999999999.99),
  currency: z.string().trim().length(3).toUpperCase().default('INR'),
});

export const priceProductParamSchema = z.object({
  productId: z.string().uuid(),
});

export const listPricesQuerySchema = paginationQuerySchema;

export type ChangePriceInput = z.infer<typeof changePriceSchema>;
export type PriceProductParam = z.infer<typeof priceProductParamSchema>;
