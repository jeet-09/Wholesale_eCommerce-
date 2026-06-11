'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiRequestPaginated } from '@/lib/api';
import type { QueryValue } from '@/lib/api';
import type { Product } from '@/lib/types';

export interface ProductFilters extends Record<string, QueryValue> {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  categoryId?: string;
  vendorId?: string;
  isFeatured?: boolean;
  sort?: string;
}

export function useProducts(filters: ProductFilters) {
  return useQuery({
    queryKey: ['products', filters],
    queryFn: () => apiRequestPaginated<Product>('/products', { query: filters }),
    placeholderData: keepPreviousData,
  });
}
