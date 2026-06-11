'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest, apiRequestPaginated } from '@/lib/api';
import type { QueryValue } from '@/lib/api';
import type { Order } from '@/lib/types';

export interface OrderFilters extends Record<string, QueryValue> {
  page?: number;
  pageSize?: number;
  status?: string;
  sort?: string;
}

export function useOrders(filters: OrderFilters) {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: () => apiRequestPaginated<Order>('/orders', { query: filters }),
  });
}

export function useOrder(id: string | null) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => apiRequest<Order>(`/orders/${id}`),
    enabled: Boolean(id),
  });
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function usePlaceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { notes?: string }) =>
      apiRequest<Order[]>('/orders', {
        method: 'POST',
        body,
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      remarks,
    }: {
      id: string;
      status: string;
      remarks?: string;
    }) => apiRequest<Order>(`/orders/${id}/status`, { method: 'PATCH', body: { status, remarks } }),
    onSuccess: (data) => {
      queryClient.setQueryData(['order', data.id], data);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiRequest<Order>(`/orders/${id}/cancel`, { method: 'POST', body: { reason } }),
    onSuccess: (data) => {
      queryClient.setQueryData(['order', data.id], data);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
