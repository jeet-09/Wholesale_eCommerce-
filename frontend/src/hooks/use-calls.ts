'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api';

export interface VendorCall {
  id: string;
  orderId: string;
  orderNumber: string | null;
  vendorId: string;
  vendorName: string | null;
  calledBy: string | null;
  outcome: string;
  remarks: string | null;
  createdAt: string;
}

/** Call logs for an order (Administration). */
export function useOrderCalls(orderId: string | null, enabled = true) {
  return useQuery({
    queryKey: ['order-calls', orderId],
    queryFn: () => apiRequest<VendorCall[]>(`/orders/${orderId}/calls`),
    enabled: enabled && Boolean(orderId),
  });
}

export function useLogCall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      orderId,
      vendorId,
      outcome,
      remarks,
    }: {
      orderId: string;
      vendorId: string;
      outcome: string;
      remarks?: string;
    }) =>
      apiRequest<VendorCall>(`/orders/${orderId}/calls`, {
        method: 'POST',
        body: { vendorId, outcome, remarks },
      }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['order-calls', data.orderId] });
      void queryClient.invalidateQueries({ queryKey: ['performance'] });
    },
  });
}
