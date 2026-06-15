import { z } from 'zod';

import { paginationQuerySchema } from '../../common/pagination';

const CALL_OUTCOMES = ['ACCEPTED', 'REJECTED', 'NO_RESPONSE', 'PARTIAL'] as const;

export const callResponseSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  orderNumber: z.string().nullable(),
  vendorId: z.string().uuid(),
  vendorName: z.string().nullable(),
  calledBy: z.string().uuid().nullable(),
  outcome: z.enum(CALL_OUTCOMES),
  remarks: z.string().nullable(),
  createdAt: z.string(),
});

export const callOrderIdParamSchema = z.object({
  orderId: z.string().uuid(),
});

// Administration logs the outcome of a call to a vendor about an order.
export const logCallSchema = z.object({
  vendorId: z.string().uuid(),
  outcome: z.enum(CALL_OUTCOMES),
  remarks: z.string().trim().max(1000).optional(),
});

export const listCallsQuerySchema = paginationQuerySchema.extend({
  vendorId: z.string().uuid().optional(),
  outcome: z.enum(CALL_OUTCOMES).optional(),
});

export type CallOrderIdParam = z.infer<typeof callOrderIdParamSchema>;
export type LogCallInput = z.infer<typeof logCallSchema>;
export type ListCallsQueryInput = z.infer<typeof listCallsQuerySchema>;
