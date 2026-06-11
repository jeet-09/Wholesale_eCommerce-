import { z } from 'zod';

import {
  currencySchema,
  moneyStringSchema,
  quantityStringSchema,
} from '../../common/schemas';
import { paginationQuerySchema } from '../../common/pagination';

const PRODUCT_UNITS = ['KG', 'GRAM', 'LITER', 'ML', 'PIECE', 'BOX', 'PACKET'] as const;
const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'OUT_OF_STOCK', 'ARCHIVED'] as const;

export const productResponseSchema = z.object({
  id: z.string().uuid(),
  vendorId: z.string().uuid(),
  vendorName: z.string().nullable(),
  categoryId: z.string().uuid(),
  categoryName: z.string().nullable(),
  sku: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  unit: z.enum(PRODUCT_UNITS),
  brand: z.string().nullable(),
  status: z.enum(PRODUCT_STATUSES),
  isFeatured: z.boolean(),
  currentPrice: z
    .object({ price: moneyStringSchema, currency: currencySchema })
    .nullable(),
  inventory: z
    .object({
      availableQuantity: quantityStringSchema,
      reservedQuantity: quantityStringSchema,
      sellableQuantity: quantityStringSchema,
    })
    .nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createProductSchema = z.object({
  categoryId: z.string().uuid(),
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  unit: z.enum(PRODUCT_UNITS),
  brand: z.string().trim().max(100).optional(),
  status: z.enum(PRODUCT_STATUSES).default('DRAFT'),
  isFeatured: z.boolean().default(false),
  price: z.coerce.number().positive().max(99999999999.99),
  currency: z.string().trim().length(3).toUpperCase().default('INR'),
  initialStock: z.coerce.number().nonnegative().default(0),
  minimumStock: z.coerce.number().nonnegative().default(0),
  // Privileged staff may create on behalf of a vendor; vendors use their own.
  vendorId: z.string().uuid().optional(),
});

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    brand: z.string().trim().max(100).nullable().optional(),
    categoryId: z.string().uuid().optional(),
    status: z.enum(PRODUCT_STATUSES).optional(),
    isFeatured: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'At least one field is required' });

export const listProductsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(PRODUCT_STATUSES).optional(),
  categoryId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  search: z.string().trim().min(1).max(100).optional(),
  isFeatured: z.coerce.boolean().optional(),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ListProductsQueryInput = z.infer<typeof listProductsQuerySchema>;
