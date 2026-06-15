import { z } from 'zod';

import { paginationQuerySchema } from '../../common/pagination';

export const performanceResponseSchema = z.object({
  vendorId: z.string().uuid(),
  vendorName: z.string().nullable(),
  totalAssigned: z.number().int(),
  totalAccepted: z.number().int(),
  totalRejected: z.number().int(),
  totalCompleted: z.number().int(),
  totalNoResponse: z.number().int(),
  acceptanceRate: z.number(),
  completionRate: z.number(),
  successRate: z.number(),
  averageFulfilmentMinutes: z.number().nullable(),
  averageRating: z.number().nullable(),
});

export const vendorIdParamSchema = z.object({
  vendorId: z.string().uuid(),
});

export const rateVendorSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  remarks: z.string().trim().max(500).optional(),
});

export const listPerformanceQuerySchema = paginationQuerySchema;

export type VendorIdParam = z.infer<typeof vendorIdParamSchema>;
export type RateVendorInput = z.infer<typeof rateVendorSchema>;
