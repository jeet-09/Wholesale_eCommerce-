'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequestPaginated } from '@/lib/api';
import type { Category } from '@/lib/types';

export function useCategories() {
  return useQuery({
    queryKey: ['categories', 'active'],
    queryFn: () =>
      apiRequestPaginated<Category>('/categories', {
        query: { status: 'ACTIVE', pageSize: 100 },
      }),
    staleTime: 5 * 60_000,
  });
}
