'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest, apiRequestPaginated } from '@/lib/api';
import type { QueryValue } from '@/lib/api';
import type { Order } from '@/lib/types';

export interface OrderFilters extends Record<string, QueryValue> {
  page?: number;
  pageSize?: number;
  status?: string;
  vendorId?: string;
  restaurantId?: string;
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

/** Shared cache invalidation + optimistic single-order cache update. */
function useOrderMutation<TVars>(
  mutationFn: (vars: TVars) => Promise<Order>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      queryClient.setQueryData(['order', data.id], data);
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}

export function usePlaceOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { notes?: string }) =>
      apiRequest<Order>('/orders', {
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

/** Administration assigns a vendor to a reviewed order. */
export function useAssignVendor() {
  return useOrderMutation(({ id, vendorId, remarks }: { id: string; vendorId: string; remarks?: string }) =>
    apiRequest<Order>(`/orders/${id}/assign`, { method: 'POST', body: { vendorId, remarks } }),
  );
}

/** Vendor accepts or rejects an assignment. */
export function useVendorRespond() {
  return useOrderMutation(({ id, accept, remarks }: { id: string; accept: boolean; remarks?: string }) =>
    apiRequest<Order>(`/orders/${id}/respond`, { method: 'POST', body: { accept, remarks } }),
  );
}

/** Vendor advances fulfilment (processing → ready → delivered). */
export function useUpdateFulfilment() {
  return useOrderMutation(({ id, status, remarks }: { id: string; status: string; remarks?: string }) =>
    apiRequest<Order>(`/orders/${id}/fulfilment`, { method: 'PATCH', body: { status, remarks } }),
  );
}

/** Administration marks a delivered order COMPLETED (optionally rates the vendor). */
export function useCompleteOrder() {
  return useOrderMutation(({ id, rating, remarks }: { id: string; rating?: number; remarks?: string }) =>
    apiRequest<Order>(`/orders/${id}/complete`, { method: 'POST', body: { rating, remarks } }),
  );
}

/** Administration rejects an order. */
export function useRejectOrder() {
  return useOrderMutation(({ id, reason }: { id: string; reason?: string }) =>
    apiRequest<Order>(`/orders/${id}/reject`, { method: 'POST', body: { reason } }),
  );
}

export function useCancelOrder() {
  return useOrderMutation(({ id, reason }: { id: string; reason?: string }) =>
    apiRequest<Order>(`/orders/${id}/cancel`, { method: 'POST', body: { reason } }),
  );
}
