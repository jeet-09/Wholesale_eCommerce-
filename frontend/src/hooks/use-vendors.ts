'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequestPaginated } from '@/lib/api';
import type { QueryValue } from '@/lib/api';
import type { Vendor } from '@/lib/types';

export interface VendorFilters extends Record<string, QueryValue> {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
}

/** List vendors (Administration / Admin) — used for order assignment. */
export function useVendors(filters: VendorFilters = {}, enabled = true) {
  return useQuery({
    queryKey: ['vendors', filters],
    queryFn: () => apiRequestPaginated<Vendor>('/vendors', { query: filters }),
    enabled,
    staleTime: 60_000,
  });
}
