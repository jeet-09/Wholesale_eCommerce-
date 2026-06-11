'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api';
import type { Cart } from '@/lib/types';

export function useCart(enabled = true) {
  return useQuery({
    queryKey: ['cart'],
    queryFn: () => apiRequest<Cart>('/cart'),
    enabled,
  });
}

export function useAddToCart() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { productId: string; quantity: number }) =>
      apiRequest<Cart>('/cart/items', { method: 'POST', body }),
    onSuccess: (data) => queryClient.setQueryData(['cart'], data),
  });
}

export function useUpdateCartItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      apiRequest<Cart>(`/cart/items/${itemId}`, { method: 'PATCH', body: { quantity } }),
    onSuccess: (data) => queryClient.setQueryData(['cart'], data),
  });
}

export function useRemoveCartItem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) =>
      apiRequest<Cart>(`/cart/items/${itemId}`, { method: 'DELETE' }),
    onSuccess: (data) => queryClient.setQueryData(['cart'], data),
  });
}
