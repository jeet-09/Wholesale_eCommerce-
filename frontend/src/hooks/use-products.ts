'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest, apiRequestPaginated } from '@/lib/api';
import type { QueryValue } from '@/lib/api';
import type { PriceSuggestion, Product, ProductPrice } from '@/lib/types';

export interface ProductFilters extends Record<string, QueryValue> {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  categoryId?: string;
  isFeatured?: boolean;
  inStock?: boolean;
  sort?: string;
}

export function useProducts(filters: ProductFilters) {
  return useQuery({
    queryKey: ['products', filters],
    queryFn: () => apiRequestPaginated<Product>('/products', { query: filters }),
    placeholderData: keepPreviousData,
  });
}

// --- Master catalog management (Admin) -------------------------------------

export interface CreateProductBody {
  categoryId: string;
  sku: string;
  name: string;
  description?: string | null;
  unit: string;
  brand?: string | null;
  isFeatured: boolean;
  transportPercent?: number;
}

export interface UpdateProductBody {
  name?: string;
  description?: string | null;
  brand?: string | null;
  categoryId?: string;
  unit?: string;
  isFeatured?: boolean;
  transportPercent?: number;
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateProductBody) =>
      apiRequest<Product>('/products', { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateProductBody }) =>
      apiRequest<Product>(`/products/${id}`, { method: 'PATCH', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiRequest<void>(`/products/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}

/** Approve / reject / (de)activate a product (Administration / Admin). */
export function useChangeProductStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, remarks }: { id: string; status: string; remarks?: string }) =>
      apiRequest<Product>(`/products/${id}/status`, {
        method: 'PATCH',
        body: { status, remarks },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}

/** Suggested selling price = avg(vendor offers) + transport markup. */
export function usePriceSuggestion(productId: string | null) {
  return useQuery({
    queryKey: ['price-suggestion', productId],
    queryFn: () => apiRequest<PriceSuggestion>(`/products/${productId}/price-suggestion`),
    enabled: Boolean(productId),
  });
}

/** Set the selling price (omit `price` to auto-compute, provide it to override). */
export function useSetPrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, price, currency }: { id: string; price?: number; currency: string }) => {
      const body: Record<string, string | number> = { currency };
      if (price !== undefined) body.price = price;
      return apiRequest<ProductPrice>(`/products/${id}/price`, { method: 'POST', body });
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['price-suggestion', variables.id] });
    },
  });
}
