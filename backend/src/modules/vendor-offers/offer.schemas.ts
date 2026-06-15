import { z } from 'zod';

import { currencySchema, moneyStringSchema, quantityStringSchema } from '../../common/schemas';
import { paginationQuerySchema } from '../../common/pagination';

const OFFER_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'INACTIVE'] as const;
const REVIEW_STATUSES = ['APPROVED', 'REJECTED', 'INACTIVE'] as const;

export const offerResponseSchema = z.object({
  id: z.string().uuid(),
  vendorId: z.string().uuid(),
  vendorName: z.string().nullable(),
  productId: z.string().uuid(),
  productName: z.string().nullable(),
  productSku: z.string().nullable(),
  unit: z.string().nullable(),
  vendorPrice: moneyStringSchema,
  currency: currencySchema,
  availableQuantity: quantityStringSchema,
  reservedQuantity: quantityStringSchema,
  sellableQuantity: quantityStringSchema,
  status: z.enum(OFFER_STATUSES),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Vendor submits a price + available stock for an APPROVED master product.
// Upsert semantics: one active offer per (vendor, product).
export const submitOfferSchema = z.object({
  productId: z.string().uuid(),
  vendorPrice: z.coerce.number().positive().max(99999999999.99),
  availableQuantity: z.coerce.number().nonnegative().max(99999999.999).default(0),
  currency: z.string().trim().length(3).toUpperCase().default('INR'),
});

// Vendor updates their own offer's price and/or stock.
export const updateOfferSchema = z
  .object({
    vendorPrice: z.coerce.number().positive().max(99999999999.99).optional(),
    availableQuantity: z.coerce.number().nonnegative().max(99999999.999).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

// Admin / Administration approves, rejects, or deactivates a vendor's offer.
export const reviewOfferSchema = z.object({
  status: z.enum(REVIEW_STATUSES),
  remarks: z.string().trim().max(500).optional(),
});

export const listOffersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(OFFER_STATUSES).optional(),
  productId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
});

export type SubmitOfferInput = z.infer<typeof submitOfferSchema>;
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;
export type ReviewOfferInput = z.infer<typeof reviewOfferSchema>;
export type ListOffersQueryInput = z.infer<typeof listOffersQuerySchema>;
