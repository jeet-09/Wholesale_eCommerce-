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
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
] as const;

// Vendor-driven fulfilment transitions (after accepting an assignment).
const FULFILMENT_STATUSES = [
  'PROCESSING',
  'READY_FOR_DELIVERY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
] as const;

// Lenient phone validation (E.164-ish; allows +, spaces, hyphens).
const phoneSchema = z
  .string()
  .trim()
  .regex(/^[+]?[0-9][0-9\s-]{6,18}$/, 'Enter a valid phone number');

export const orderItemResponseSchema = z.object({
  id: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string(),
  sku: z.string(),
  unit: z.string(),
  unitPrice: moneyStringSchema,
  quantity: quantityStringSchema,
  subtotal: moneyStringSchema,
  deliveredQuantity: quantityStringSchema.nullable(),
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
  requestedDeliveryDate: z.string().nullable(),
  isSameDayDelivery: z.boolean(),
  sameDayCharge: moneyStringSchema,
  deliveryContactPhone: z.string().nullable(),
  dispatchNote: z.string().nullable(),
  dispatchedAt: z.string().nullable(),
  customerRating: z.number().int().min(1).max(5).nullable(),
  customerReview: z.string().nullable(),
  ratedAt: z.string().nullable(),
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

export const placeOrderSchema = z.object({
  notes: z.string().trim().max(1000).optional(),
  // Requested delivery day (YYYY-MM-DD). Must be today..+20 days; today incurs a
  // same-day surcharge. Range is validated in the service against the server clock.
  requestedDeliveryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Delivery date must be in YYYY-MM-DD format'),
});

export const listOrdersQuerySchema = paginationQuerySchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  // Convenience grouping for the card board: ACTIVE = live orders still moving
  // through the pipeline; ARCHIVED = completed/rejected/cancelled. Ignored when an
  // explicit `status` is given.
  statusGroup: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
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

// One line of partial-fulfilment info: how much of an ordered item was sent.
export const dispatchItemSchema = z.object({
  orderItemId: z.string().uuid(),
  deliveredQuantity: z.coerce.number().min(0),
});

// Vendor advances fulfilment (processing → ready → out for delivery → delivered).
// When dispatching (OUT_FOR_DELIVERY) the vendor records the delivery contact and,
// if stock was short, the actual quantity sent per item.
export const updateFulfilmentSchema = z
  .object({
    status: z.enum(FULFILMENT_STATUSES),
    remarks: z.string().trim().max(1000).optional(),
    deliveryContactPhone: phoneSchema.optional(),
    dispatchNote: z.string().trim().max(1000).optional(),
    deliveredItems: z.array(dispatchItemSchema).max(200).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.status === 'OUT_FOR_DELIVERY' && !data.deliveryContactPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['deliveryContactPhone'],
        message: 'Delivery contact phone is required when dispatching the order',
      });
    }
  });

// Completion confirmation. The restaurant rates the order 1-5 (required for the
// buyer's review); Administration may complete without a rating as a fallback.
export const completeOrderSchema = z
  .object({
    rating: z.coerce.number().int().min(1).max(5).optional(),
    review: z.string().trim().max(2000).optional(),
    remarks: z.string().trim().max(1000).optional(),
  })
  .default({});

// Admin out-of-band status override. Can set (almost) any lifecycle status to
// fix a stuck or mis-routed order. DRAFT is excluded — it only exists before an
// order is placed. Routing to a vendor still requires Assign (it reserves stock).
export const overrideStatusSchema = z.object({
  status: z.enum([
    'PENDING_PAYMENT',
    'PAYMENT_RECEIVED',
    'PENDING_ADMIN_REVIEW',
    'VENDOR_ASSIGNED',
    'VENDOR_ACCEPTED',
    'PROCESSING',
    'READY_FOR_DELIVERY',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'COMPLETED',
    'REJECTED',
    'CANCELLED',
  ]),
  remarks: z.string().trim().max(1000).optional(),
});

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
export type OverrideStatusInput = z.infer<typeof overrideStatusSchema>;
