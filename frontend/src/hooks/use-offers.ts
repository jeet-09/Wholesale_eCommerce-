'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest, apiRequestPaginated } from '@/lib/api';
import type { QueryValue } from '@/lib/api';
import type { Offer } from '@/lib/types';

export interface OfferFilters extends Record<string, QueryValue> {
  page?: number;
  pageSize?: number;
  status?: string;
  productId?: string;
  vendorId?: string;
  sort?: string;
}

export function useOffers(filters: OfferFilters) {
  return useQuery({
    queryKey: ['offers', filters],
    queryFn: () => apiRequestPaginated<Offer>('/offers', { query: filters }),
    placeholderData: keepPreviousData,
  });
}

/** Offers for a single product (Administration/Admin pricing view). */
export function useProductOffers(productId: string | null) {
  return useQuery({
    queryKey: ['product-offers', productId],
    queryFn: () =>
      apiRequestPaginated<Offer>('/offers', { query: { productId: productId ?? undefined, pageSize: 100 } }),
    enabled: Boolean(productId),
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['offers'] });
  void queryClient.invalidateQueries({ queryKey: ['products'] });
}

export function useSubmitOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      productId: string;
      vendorPrice: number;
      availableQuantity: number;
      currency?: string;
    }) => apiRequest<Offer>('/offers', { method: 'POST', body }),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useUpdateOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      vendorPrice,
      availableQuantity,
    }: {
      id: string;
      vendorPrice?: number;
      availableQuantity?: number;
    }) => {
      const body: Record<string, number> = {};
      if (vendorPrice !== undefined) body.vendorPrice = vendorPrice;
      if (availableQuantity !== undefined) body.availableQuantity = availableQuantity;
      return apiRequest<Offer>(`/offers/${id}`, { method: 'PATCH', body });
    },
    onSuccess: () => invalidate(queryClient),
  });
}

/** Administration / Admin approves, rejects, or deactivates an offer. */
export function useReviewOffer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, remarks }: { id: string; status: string; remarks?: string }) =>
      apiRequest<Offer>(`/offers/${id}/review`, { method: 'PATCH', body: { status, remarks } }),
    onSuccess: () => invalidate(queryClient),
  });
}
