import { z } from 'zod';

import { currencySchema, moneyStringSchema } from '../../common/schemas';
import { paginationQuerySchema } from '../../common/pagination';

export const priceResponseSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  price: moneyStringSchema,
  currency: currencySchema,
  averageVendorPrice: moneyStringSchema.nullable(),
  transportPercent: z.string().nullable(),
  isOverride: z.boolean(),
  effectiveFrom: z.string(),
  effectiveTo: z.string().nullable(),
  isCurrent: z.boolean(),
  createdAt: z.string(),
});

export const priceSuggestionResponseSchema = z.object({
  productId: z.string().uuid(),
  vendorCount: z.number().int(),
  averageVendorPrice: moneyStringSchema.nullable(),
  transportPercent: z.string(),
  computedPrice: moneyStringSchema.nullable(),
  currentPrice: moneyStringSchema.nullable(),
  currency: currencySchema,
});

// Set the selling price. Omit `price` to auto-compute it from the average
// vendor offer + transport markup; provide `price` to override it manually.
export const setPriceSchema = z.object({
  price: z.coerce.number().positive().max(99999999999.99).optional(),
  currency: z.string().trim().length(3).toUpperCase().default('INR'),
});

export const priceProductParamSchema = z.object({
  productId: z.string().uuid(),
});

export const listPricesQuerySchema = paginationQuerySchema;

export type SetPriceInput = z.infer<typeof setPriceSchema>;
export type PriceProductParam = z.infer<typeof priceProductParamSchema>;
