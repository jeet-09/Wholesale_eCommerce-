'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest, apiRequestPaginated } from '@/lib/api';
import type { QueryValue } from '@/lib/api';
import type { Payment } from '@/lib/types';

export interface PaymentFilters extends Record<string, QueryValue> {
  page?: number;
  pageSize?: number;
  status?: string;
  orderId?: string;
}

/** Administration verification queue / global payment list. */
export function usePayments(filters: PaymentFilters) {
  return useQuery({
    queryKey: ['payments', filters],
    queryFn: () => apiRequestPaginated<Payment>('/payments', { query: filters }),
  });
}

/** Payments for a single order (restaurant: own; staff: any). */
export function useOrderPayments(orderId: string | null) {
  return useQuery({
    queryKey: ['order-payments', orderId],
    queryFn: () => apiRequest<Payment[]>(`/orders/${orderId}/payments`),
    enabled: Boolean(orderId),
  });
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>, orderId?: string) {
  void queryClient.invalidateQueries({ queryKey: ['payments'] });
  void queryClient.invalidateQueries({ queryKey: ['orders'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  if (orderId) {
    void queryClient.invalidateQueries({ queryKey: ['order', orderId] });
    void queryClient.invalidateQueries({ queryKey: ['order-payments', orderId] });
  }
}

/** Restaurant submits its advance-payment proof for an order. */
export function useSubmitPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      proofUrl,
      transactionReference,
      remarks,
    }: {
      orderId: string;
      proofUrl: string;
      transactionReference?: string;
      remarks?: string;
    }) =>
      apiRequest<Payment>(`/orders/${orderId}/payments`, {
        method: 'POST',
        body: { proofUrl, transactionReference, remarks },
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: (data) => invalidate(queryClient, data.orderId),
  });
}

export function useVerifyPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<Payment>(`/payments/${id}/verify`, { method: 'POST' }),
    onSuccess: (data) => invalidate(queryClient, data.orderId),
  });
}

export function useRejectPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiRequest<Payment>(`/payments/${id}/reject`, { method: 'POST', body: { reason } }),
    onSuccess: (data) => invalidate(queryClient, data.orderId),
  });
}
