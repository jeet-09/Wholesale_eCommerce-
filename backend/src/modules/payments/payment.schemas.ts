import { z } from 'zod';

import { currencySchema, moneyStringSchema } from '../../common/schemas';
import { paginationQuerySchema } from '../../common/pagination';

const PAYMENT_STATUSES = [
  'PENDING',
  'SUBMITTED',
  'VERIFIED',
  'REJECTED',
  'SUCCESS',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;

export const paymentResponseSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  orderNumber: z.string().nullable(),
  paymentType: z.string(),
  amount: moneyStringSchema,
  currency: currencySchema,
  status: z.enum(PAYMENT_STATUSES),
  proofUrl: z.string().nullable(),
  transactionReference: z.string().nullable(),
  remarks: z.string().nullable(),
  submittedBy: z.string().uuid().nullable(),
  verifiedBy: z.string().uuid().nullable(),
  verifiedAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
});

export const orderIdParamSchema = z.object({
  orderId: z.string().uuid(),
});

// Restaurant uploads its PhonePe/UPI advance proof against an order.
export const submitPaymentSchema = z.object({
  proofUrl: z.string().trim().min(1).max(2048),
  transactionReference: z.string().trim().max(255).optional(),
  remarks: z.string().trim().max(1000).optional(),
});

export const rejectPaymentSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

export const listPaymentsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(PAYMENT_STATUSES).optional(),
  orderId: z.string().uuid().optional(),
});

export type OrderIdParam = z.infer<typeof orderIdParamSchema>;
export type SubmitPaymentInput = z.infer<typeof submitPaymentSchema>;
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;
export type ListPaymentsQueryInput = z.infer<typeof listPaymentsQuerySchema>;
