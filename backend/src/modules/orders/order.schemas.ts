import { z } from 'zod';

import { currencySchema, moneyStringSchema, quantityStringSchema } from '../../common/schemas';
import { paginationQuerySchema } from '../../common/pagination';

const ORDER_STATUSES = [
  'DRAFT',
  'PENDING_PAYMENT',
  'PAYMENT_RECEIVED',
  'PENDING_ADMIN_REVIEW',
  'VENDOR_ASSIGNED',
  'VENDOR_ACCEPTED',
  'PROCESSING',
  'READY_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const;

// Vendor-driven fulfilment transitions (after accepting an assignment).
const FULFILMENT_STATUSES = ['PROCESSING', 'READY_FOR_DELIVERY', 'DELIVERED'] as const;

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

export const orderPaymentResponseSchema = z.object({
  id: z.string().uuid(),
  paymentType: z.string(),
  amount: moneyStringSchema,
  currency: currencySchema,
  status: z.string(),
  proofUrl: z.string().nullable(),
  transactionReference: z.string().nullable(),
  remarks: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const orderResponseSchema = z.object({
  id: z.string().uuid(),
  orderNumber: z.string(),
  restaurantId: z.string().uuid(),
  restaurantName: z.string().nullable(),
  assignedVendorId: z.string().uuid().nullable(),
  assignedVendorName: z.string().nullable(),
  status: z.enum(ORDER_STATUSES),
  currency: z.string(),
  subtotal: moneyStringSchema,
  discountAmount: moneyStringSchema,
  gstAmount: moneyStringSchema,
  deliveryCharges: moneyStringSchema,
  totalAmount: moneyStringSchema,
  advancePercent: z.string(),
  advanceAmount: moneyStringSchema,
  remainingAmount: moneyStringSchema,
  placedAt: z.string().nullable(),
  paymentSubmittedAt: z.string().nullable(),
  paymentVerifiedAt: z.string().nullable(),
  reviewedAt: z.string().nullable(),
  assignedAt: z.string().nullable(),
  acceptedAt: z.string().nullable(),
  readyAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  rejectedAt: z.string().nullable(),
  cancelledAt: z.string().nullable(),
  items: z.array(orderItemResponseSchema),
  statusHistory: z.array(orderStatusHistoryResponseSchema),
  payments: z.array(orderPaymentResponseSchema),
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

// Administration assigns a vendor to a reviewed order.
export const assignVendorSchema = z.object({
  vendorId: z.string().uuid(),
  remarks: z.string().trim().max(1000).optional(),
});

// Vendor accepts or rejects an assignment.
export const vendorRespondSchema = z.object({
  accept: z.boolean(),
  remarks: z.string().trim().max(1000).optional(),
});

// Vendor advances fulfilment (processing → ready → delivered).
export const updateFulfilmentSchema = z.object({
  status: z.enum(FULFILMENT_STATUSES),
  remarks: z.string().trim().max(1000).optional(),
});

// Administration verifies completion (optionally rating the vendor 1-5).
export const completeOrderSchema = z
  .object({
    rating: z.coerce.number().int().min(1).max(5).optional(),
    remarks: z.string().trim().max(1000).optional(),
  })
  .default({});

export const rejectOrderSchema = z
  .object({
    reason: z.string().trim().max(1000).optional(),
  })
  .default({});

export const cancelOrderSchema = z
  .object({
    reason: z.string().trim().max(1000).optional(),
  })
  .default({});

export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;
export type ListOrdersQueryInput = z.infer<typeof listOrdersQuerySchema>;
export type AssignVendorInput = z.infer<typeof assignVendorSchema>;
export type VendorRespondInput = z.infer<typeof vendorRespondSchema>;
export type UpdateFulfilmentInput = z.infer<typeof updateFulfilmentSchema>;
export type CompleteOrderInput = z.infer<typeof completeOrderSchema>;
export type RejectOrderInput = z.infer<typeof rejectOrderSchema>;
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
