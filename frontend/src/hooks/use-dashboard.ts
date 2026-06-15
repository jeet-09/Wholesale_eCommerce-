'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api';
import type { Dashboard } from '@/lib/types';

/** Role-scoped dashboard summary (restaurant / vendor / administration / admin). */
export function useDashboard(enabled = true) {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => apiRequest<Dashboard>('/analytics/dashboard'),
    enabled,
  });
}
