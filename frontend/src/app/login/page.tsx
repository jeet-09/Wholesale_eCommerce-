'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Input, Label } from '@/components/ui/input';
import { useLogin } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

export default function LoginPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.accessToken);
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (token) router.replace('/dashboard');
  }, [token, router]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    login.mutate({ email, password });
  };

  const errorMessage = login.error instanceof ApiError ? login.error.message : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-brand-700">
            Procure<span className="text-gray-900">Hub</span>
          </h1>
          <p className="mt-1 text-sm text-gray-500">B2B restaurant procurement platform</p>
        </div>
        <Card>
          <CardBody className="p-6">
            <h2 className="mb-4 text-lg font-semibold text-gray-900">Sign in</h2>
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {errorMessage && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
              )}
              <Button type="submit" className="w-full" disabled={login.isPending}>
                {login.isPending ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-gray-500">
              No account?{' '}
              <Link href="/register" className="font-medium text-brand-700 hover:underline">
                Create one
              </Link>
            </p>
          </CardBody>
        </Card>
        <div className="mt-4 rounded-md border border-gray-200 bg-white p-3 text-xs text-gray-500">
          <p className="font-medium text-gray-700">Demo accounts (password: Password123!)</p>
          <p>restaurant@demo.local · vendor@demo.local · ops@procurement.local · admin@procurement.local</p>
        </div>
      </div>
    </div>
  );
}
