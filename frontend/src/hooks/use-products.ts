'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest, apiRequestPaginated } from '@/lib/api';
import type { QueryValue } from '@/lib/api';
import type { Inventory, Product, ProductPrice } from '@/lib/types';

export interface ProductFilters extends Record<string, QueryValue> {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  categoryId?: string;
  vendorId?: string;
  isFeatured?: boolean;
  sort?: string;
}

export function useProducts(filters: ProductFilters) {
  return useQuery({
    queryKey: ['products', filters],
    queryFn: () => apiRequestPaginated<Product>('/products', { query: filters }),
    placeholderData: keepPreviousData,
  });
}

// --- Vendor catalog management ---------------------------------------------

export interface CreateProductBody {
  categoryId: string;
  sku: string;
  name: string;
  description?: string | null;
  unit: string;
  brand?: string | null;
  status: string;
  isFeatured: boolean;
  price: number;
  currency: string;
  initialStock: number;
  minimumStock: number;
}

export interface UpdateProductBody {
  name?: string;
  description?: string | null;
  brand?: string | null;
  categoryId?: string;
  status?: string;
  isFeatured?: boolean;
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

export function useChangePrice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, price, currency }: { id: string; price: number; currency: string }) =>
      apiRequest<ProductPrice>(`/products/${id}/price`, {
        method: 'POST',
        body: { price, currency },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}

export function useAdjustInventory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      availableQuantity,
      minimumQuantity,
    }: {
      id: string;
      availableQuantity?: number;
      minimumQuantity?: number;
    }) => {
      const body: Record<string, number> = {};
      if (availableQuantity !== undefined) body.availableQuantity = availableQuantity;
      if (minimumQuantity !== undefined) body.minimumQuantity = minimumQuantity;
      return apiRequest<Inventory>(`/products/${id}/inventory`, { method: 'PATCH', body });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
}
