'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest, apiRequestPaginated } from '@/lib/api';
import type { QueryValue } from '@/lib/api';
import type { Order } from '@/lib/types';

export interface OrderFilters extends Record<string, QueryValue> {
  page?: number;
  pageSize?: number;
  status?: string;
  /** ACTIVE = live orders, ARCHIVED = completed/rejected/cancelled. */
  statusGroup?: 'ACTIVE' | 'ARCHIVED';
  vendorId?: string;
  restaurantId?: string;
  sort?: string;
}

/** One line of partial-fulfilment info sent at dispatch. */
export interface DispatchItemInput {
  orderItemId: string;
  deliveredQuantity: number;
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
    mutationFn: (body: { requestedDeliveryDate: string; notes?: string }) =>
      apiRequest<Order>('/orders', {
        method: 'POST',
        body,
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
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

/**
 * Vendor advances fulfilment (processing → ready → out for delivery → delivered).
 * Dispatching (OUT_FOR_DELIVERY) carries the delivery contact phone, an optional
 * note, and the actual quantity sent per line item when stock was short.
 */
export function useUpdateFulfilment() {
  return useOrderMutation(
    ({
      id,
      status,
      remarks,
      deliveryContactPhone,
      dispatchNote,
      deliveredItems,
    }: {
      id: string;
      status: string;
      remarks?: string;
      deliveryContactPhone?: string;
      dispatchNote?: string;
      deliveredItems?: DispatchItemInput[];
    }) =>
      apiRequest<Order>(`/orders/${id}/fulfilment`, {
        method: 'PATCH',
        body: { status, remarks, deliveryContactPhone, dispatchNote, deliveredItems },
      }),
  );
}

/**
 * Confirms a delivered order COMPLETED. The owning restaurant leaves a 1-5★
 * review; Administration can complete as a fallback without a rating.
 */
export function useCompleteOrder() {
  return useOrderMutation(
    ({
      id,
      rating,
      review,
      remarks,
    }: {
      id: string;
      rating?: number;
      review?: string;
      remarks?: string;
    }) =>
      apiRequest<Order>(`/orders/${id}/complete`, {
        method: 'POST',
        body: { rating, review, remarks },
      }),
  );
}

/**
 * Admin super-power: force an order to any status, bypassing the normal state
 * machine (out-of-band correction). Routing to a vendor still uses Assign.
 */
export function useOverrideOrderStatus() {
  return useOrderMutation(({ id, status, remarks }: { id: string; status: string; remarks?: string }) =>
    apiRequest<Order>(`/orders/${id}/status`, { method: 'PATCH', body: { status, remarks } }),
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
