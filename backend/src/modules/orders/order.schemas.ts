import { z } from 'zod';

import { moneyStringSchema, quantityStringSchema } from '../../common/schemas';
import { paginationQuerySchema } from '../../common/pagination';

const ORDER_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'PROCESSING',
  'READY_FOR_DISPATCH',
  'DELIVERED',
  'CANCELLED',
  'REJECTED',
] as const;

export const orderItemResponseSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string(),
  sku: z.string(),
  unit: z.string(),
  unitPrice: moneyStringSchema,
  quantity: quantityStringSchema,
  subtotal: moneyStringSchema,
});

export const orderStatusHistoryResponseSchema = z.object({
  id: z.string().uuid(),
  oldStatus: z.enum(ORDER_STATUSES).nullable(),
  newStatus: z.enum(ORDER_STATUSES),
  changedBy: z.string().uuid().nullable(),
  remarks: z.string().nullable(),
  createdAt: z.string(),
});

export const orderResponseSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  restaurantId: z.string().uuid(),
  restaurantName: z.string().nullable(),
  vendorId: z.string().uuid(),
  vendorName: z.string().nullable(),
  status: z.enum(ORDER_STATUSES),
  currency: z.string(),
  subtotal: moneyStringSchema,
  discountAmount: moneyStringSchema,
  gstAmount: moneyStringSchema,
  deliveryCharges: moneyStringSchema,
  totalAmount: moneyStringSchema,
  placedAt: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  items: z.array(orderItemResponseSchema),
  statusHistory: z.array(orderStatusHistoryResponseSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const placeOrderSchema = z
  .object({
    notes: z.string().trim().max(1000).optional(),
  })
  .default({});

export const listOrdersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  vendorId: z.string().uuid().optional(),
  restaurantId: z.string().uuid().optional(),
});

export const updateOrderStatusSchema = z.object({
  status: z.enum(['ACCEPTED', 'PROCESSING', 'READY_FOR_DISPATCH', 'DELIVERED', 'REJECTED', 'CANCELLED']),
  remarks: z.string().trim().max(1000).optional(),
});

export const cancelOrderSchema = z
  .object({
    reason: z.string().trim().max(1000).optional(),
  })
  .default({});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type ListOrdersQueryInput = z.infer<typeof listOrdersQuerySchema>;
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
