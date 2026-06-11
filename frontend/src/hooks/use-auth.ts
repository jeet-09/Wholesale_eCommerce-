'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { apiRequest } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import type { AuthResponse } from '@/lib/types';

export interface RegisterBody {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
  accountType: 'RESTAURANT' | 'VENDOR';
  organizationName: string;
}

export function useLogin() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      apiRequest<AuthResponse>('/auth/login', { method: 'POST', body }),
    onSuccess: (data) => {
      setSession(data);
      router.replace('/products');
    },
  });
}

export function useRegister() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  return useMutation({
    mutationFn: (body: RegisterBody) =>
      apiRequest<AuthResponse>('/auth/register', { method: 'POST', body }),
    onSuccess: (data) => {
      setSession(data);
      router.replace('/products');
    },
  });
}

export function useLogout() {
  const router = useRouter();
  const clear = useAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<{ message: string }>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      clear();
      queryClient.clear();
      router.replace('/login');
    },
  });
}
