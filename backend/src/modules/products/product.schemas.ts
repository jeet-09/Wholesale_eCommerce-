import { z } from 'zod';

import { currencySchema, moneyStringSchema, quantityStringSchema } from '../../common/schemas';
import { paginationQuerySchema } from '../../common/pagination';

const PRODUCT_UNITS = ['KG', 'GRAM', 'LITER', 'ML', 'PIECE', 'BOX', 'PACKET'] as const;
const PRODUCT_STATUSES = ['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'INACTIVE'] as const;
/** Statuses Administration/Admin can move a product into via the review endpoint. */
const REVIEWABLE_STATUSES = ['UNDER_REVIEW', 'APPROVED', 'REJECTED', 'INACTIVE'] as const;

export const productResponseSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  categoryName: z.string().nullable(),
  sku: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  unit: z.enum(PRODUCT_UNITS),
  brand: z.string().nullable(),
  status: z.enum(PRODUCT_STATUSES),
  isFeatured: z.boolean(),
  transportPercent: z.string(),
  sellingPrice: z.object({ price: moneyStringSchema, currency: currencySchema }).nullable(),
  supply: z.object({
    vendorCount: z.number().int(),
    averageVendorPrice: moneyStringSchema.nullable(),
    lowestVendorPrice: moneyStringSchema.nullable(),
    computedPrice: moneyStringSchema.nullable(),
    totalAvailableQuantity: quantityStringSchema,
    inStock: z.boolean(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Master catalog: Admin defines the product only. Price/stock come from vendor
// offers; the final selling price is set in the pricing module.
export const createProductSchema = z.object({
  categoryId: z.string().uuid(),
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  unit: z.enum(PRODUCT_UNITS),
  brand: z.string().trim().max(100).optional(),
  isFeatured: z.boolean().default(false),
  transportPercent: z.coerce.number().min(0).max(100).optional(),
});

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    brand: z.string().trim().max(100).nullable().optional(),
    categoryId: z.string().uuid().optional(),
    unit: z.enum(PRODUCT_UNITS).optional(),
    isFeatured: z.boolean().optional(),
    transportPercent: z.coerce.number().min(0).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

// Approve / reject / (de)activate flow (project-working.md PRODUCT STATES).
export const changeProductStatusSchema = z.object({
  status: z.enum(REVIEWABLE_STATUSES),
  remarks: z.string().trim().max(500).optional(),
});

export const listProductsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(PRODUCT_STATUSES).optional(),
  categoryId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(100).optional(),
  isFeatured: z.coerce.boolean().optional(),
  inStock: z.coerce.boolean().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ChangeProductStatusInput = z.infer<typeof changeProductStatusSchema>;
export type ListProductsQueryInput = z.infer<typeof listProductsQuerySchema>;
