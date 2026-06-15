import type { PerformanceDto, PerformanceWithVendor } from './performance.types';

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) {
    return 0;
  }
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function toPerformanceDto(row: PerformanceWithVendor): PerformanceDto {
  return {
    vendorId: row.vendorId,
    vendorName: row.vendor?.vendorName ?? null,
    totalAssigned: row.totalAssigned,
    totalAccepted: row.totalAccepted,
    totalRejected: row.totalRejected,
    totalCompleted: row.totalCompleted,
    totalNoResponse: row.totalNoResponse,
    acceptanceRate: rate(row.totalAccepted, row.totalAssigned),
    completionRate: rate(row.totalCompleted, row.totalAccepted),
    successRate: rate(row.totalCompleted, row.totalAssigned),
    averageFulfilmentMinutes:
      row.totalCompleted > 0 ? Math.round(row.fulfilmentMinutesTotal / row.totalCompleted) : null,
    averageRating:
      row.ratingCount > 0 ? Math.round((row.ratingSum / row.ratingCount) * 10) / 10 : null,
  };
}

/** A zeroed scorecard for a vendor that has no activity yet. */
export function emptyPerformanceDto(vendorId: string, vendorName: string | null): PerformanceDto {
  return {
    vendorId,
    vendorName,
    totalAssigned: 0,
    totalAccepted: 0,
    totalRejected: 0,
    totalCompleted: 0,
    totalNoResponse: 0,
    acceptanceRate: 0,
    completionRate: 0,
    successRate: 0,
    averageFulfilmentMinutes: null,
    averageRating: null,
  };
}
