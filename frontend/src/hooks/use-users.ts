'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest, apiRequestPaginated } from '@/lib/api';
import type { QueryValue } from '@/lib/api';
import type { Account, Vendor } from '@/lib/types';

export interface AccountFilters extends Record<string, QueryValue> {
  page?: number;
  pageSize?: number;
  status?: string;
  /** Filter by role: ADMIN | OPERATIONS | VENDOR | RESTAURANT. */
  role?: string;
  search?: string;
  sort?: string;
}

/** List user accounts for the admin console (roles + owning org included). */
export function useAccounts(filters: AccountFilters = {}, enabled = true) {
  return useQuery({
    queryKey: ['accounts', filters],
    queryFn: () => apiRequestPaginated<Account>('/users', { query: filters }),
    enabled,
  });
}

/** Shared cache invalidation for account mutations. */
function useAccountMutation<TVars, TData>(mutationFn: (vars: TVars) => Promise<TData>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

export function useSuspendUser() {
  return useAccountMutation((id: string) =>
    apiRequest<Account>(`/users/${id}/suspend`, { method: 'POST' }),
  );
}

export function useReactivateUser() {
  return useAccountMutation((id: string) =>
    apiRequest<Account>(`/users/${id}/reactivate`, { method: 'POST' }),
  );
}

export function useSetUserPassword() {
  return useAccountMutation(({ id, newPassword }: { id: string; newPassword: string }) =>
    apiRequest<Account>(`/users/${id}/password`, { method: 'POST', body: { newPassword } }),
  );
}

export interface CreateVendorAccountInput {
  vendorName: string;
  businessCategory?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
}

/** Admin onboards a new vendor (organization + vendor profile + owner login). */
export function useCreateVendorAccount() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateVendorAccountInput) =>
      apiRequest<Vendor>('/vendors', { method: 'POST', body }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['vendors'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
}
