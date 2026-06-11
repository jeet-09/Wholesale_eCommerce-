'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { useRegister } from '@/hooks/use-auth';
import { ApiError } from '@/lib/api';

export default function RegisterPage() {
  const register = useRegister();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    accountType: 'RESTAURANT' as 'RESTAURANT' | 'VENDOR',
    organizationName: '',
  });

  const update = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    register.mutate({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone || undefined,
      password: form.password,
      accountType: form.accountType,
      organizationName: form.organizationName,
    });
  };

  const errorMessage = register.error instanceof ApiError ? register.error.message : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold text-brand-700">
            Procure<span className="text-gray-900">Hub</span>
          </h1>
          <p className="mt-1 text-sm text-gray-500">Create your account</p>
        </div>
        <Card>
          <CardBody className="p-6">
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="firstName">First name</Label>
                  <Input id="firstName" value={form.firstName} onChange={update('firstName')} required />
                </div>
                <div>
                  <Label htmlFor="lastName">Last name</Label>
                  <Input id="lastName" value={form.lastName} onChange={update('lastName')} required />
                </div>
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email} onChange={update('email')} required />
              </div>
              <div>
                <Label htmlFor="phone">Phone (optional, E.164)</Label>
                <Input id="phone" value={form.phone} onChange={update('phone')} placeholder="+919876543210" />
              </div>
              <div>
                <Label htmlFor="accountType">Account type</Label>
                <Select id="accountType" value={form.accountType} onChange={update('accountType')}>
                  <option value="RESTAURANT">Restaurant (buyer)</option>
                  <option value="VENDOR">Vendor (seller)</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="organizationName">Organization name</Label>
                <Input
                  id="organizationName"
                  value={form.organizationName}
                  onChange={update('organizationName')}
                  required
                />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={update('password')}
                  required
                />
                <p className="mt-1 text-xs text-gray-400">Min 8 chars, at least one letter and one number.</p>
              </div>
              {errorMessage && (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{errorMessage}</p>
              )}
              <Button type="submit" className="w-full" disabled={register.isPending}>
                {register.isPending ? 'Creating…' : 'Create account'}
              </Button>
            </form>
            <p className="mt-4 text-center text-sm text-gray-500">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-brand-700 hover:underline">
                Sign in
              </Link>
            </p>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
