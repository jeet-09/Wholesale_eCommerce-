'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest, apiRequestPaginated } from '@/lib/api';
import type { QueryValue } from '@/lib/api';
import type { VendorPerformance } from '@/lib/types';

export interface PerformanceFilters extends Record<string, QueryValue> {
  page?: number;
  pageSize?: number;
  sort?: string;
}

/** Vendor scorecards (Administration / Admin monitoring). */
export function useVendorPerformanceList(filters: PerformanceFilters) {
  return useQuery({
    queryKey: ['performance', filters],
    queryFn: () => apiRequestPaginated<VendorPerformance>('/vendor-performance', { query: filters }),
  });
}

/** A single vendor scorecard (vendor: own; staff: any). */
export function useVendorPerformance(vendorId: string | null) {
  return useQuery({
    queryKey: ['performance', vendorId],
    queryFn: () => apiRequest<VendorPerformance>(`/vendor-performance/${vendorId}`),
    enabled: Boolean(vendorId),
  });
}

export function useRateVendor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ vendorId, rating, remarks }: { vendorId: string; rating: number; remarks?: string }) =>
      apiRequest<VendorPerformance>(`/vendor-performance/${vendorId}/rating`, {
        method: 'POST',
        body: { rating, remarks },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['performance'] }),
  });
}
