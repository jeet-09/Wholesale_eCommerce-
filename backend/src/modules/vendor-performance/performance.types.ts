import type { Prisma } from '@prisma/client';

/**
 * Derived vendor scorecard (project-working.md VENDOR PERFORMANCE FORMULA).
 * Raw counters live in the `vendor_performance` table; the rates below are
 * computed on read so they never drift from the counters.
 */
export interface PerformanceDto {
  vendorId: string;
  vendorName: string | null;
  totalAssigned: number;
  totalAccepted: number;
  totalRejected: number;
  totalCompleted: number;
  totalNoResponse: number;
  acceptanceRate: number;
  completionRate: number;
  successRate: number;
  averageFulfilmentMinutes: number | null;
  averageRating: number | null;
}

export const performanceInclude = {
  vendor: { select: { id: true, vendorName: true } },
} satisfies Prisma.VendorPerformanceInclude;

export type PerformanceWithVendor = Prisma.VendorPerformanceGetPayload<{
  include: typeof performanceInclude;
}>;
