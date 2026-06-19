'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Badge, Card, CardBody, StatusBadge } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import {
  useAccounts,
  useCreateVendorAccount,
  useReactivateUser,
  useSetUserPassword,
  useSuspendUser,
} from '@/hooks/use-users';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { PERMISSIONS, useAuthz } from '@/lib/authz';
import { formatDate } from '@/lib/format';
import type { Account, AccountType } from '@/lib/types';

const ROLE_FILTERS = [
  { value: '', label: 'All roles' },
  { value: 'RESTAURANT', label: 'Restaurants' },
  { value: 'VENDOR', label: 'Vendors' },
  { value: 'OPERATIONS', label: 'Operations' },
  { value: 'ADMIN', label: 'Admins' },
];

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'SUSPENDED', label: 'Suspended' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'DEACTIVATED', label: 'Deactivated' },
];

const PAGE_SIZE = 20;

type Feedback = { type: 'ok' | 'err'; message: string } | null;

function errMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong';
}

const ACCOUNT_TYPE_STYLES: Record<AccountType, string> = {
  ADMIN: 'bg-purple-100 text-purple-800',
  OPERATIONS: 'bg-indigo-100 text-indigo-800',
  VENDOR: 'bg-blue-100 text-blue-800',
  RESTAURANT: 'bg-teal-100 text-teal-800',
  NONE: 'bg-gray-100 text-gray-600',
};

function AccountTypeBadge({ type }: { type: AccountType }) {
  return <Badge className={ACCOUNT_TYPE_STYLES[type]}>{type}</Badge>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <div className="my-8 w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Card>
          <CardBody>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {children}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p className={feedback.type === 'ok' ? 'text-sm text-brand-700' : 'text-sm text-red-600'}>
      {feedback.message}
    </p>
  );
}

function CreateVendorForm({ onClose }: { onClose: () => void }) {
  const create = useCreateVendorAccount();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [form, setForm] = useState({
    vendorName: '',
    businessCategory: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!form.vendorName.trim() || !form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      setFeedback({ type: 'err', message: 'Vendor name, contact name and email are required.' });
      return;
    }
    if (form.password.length < 8) {
      setFeedback({ type: 'err', message: 'Password must be at least 8 characters (letters + a number).' });
      return;
    }
    create.mutate(
      {
        vendorName: form.vendorName.trim(),
        businessCategory: form.businessCategory.trim() || undefined,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || undefined,
        password: form.password,
      },
      {
        onSuccess: () =>
          setFeedback({
            type: 'ok',
            message: `Vendor "${form.vendorName.trim()}" created. They can sign in with ${form.email.trim()}.`,
          }),
        onError: (err) => setFeedback({ type: 'err', message: errMessage(err) }),
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
        This provisions a new vendor organization with its own login. The vendor is isolated — it only
        sees orders that Administration assigns to it.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="v-name">Vendor / business name</Label>
          <Input id="v-name" value={form.vendorName} onChange={(e) => set('vendorName', e.target.value)} placeholder="e.g. Sunrise Wholesale" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="v-category">Business category (optional)</Label>
          <Input id="v-category" value={form.businessCategory} onChange={(e) => set('businessCategory', e.target.value)} placeholder="e.g. Vegetables, Dairy" />
        </div>
        <div>
          <Label htmlFor="v-first">Contact first name</Label>
          <Input id="v-first" value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="v-last">Contact last name</Label>
          <Input id="v-last" value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="v-email">Login email</Label>
          <Input id="v-email" type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div>
          <Label htmlFor="v-phone">Phone (optional)</Label>
          <Input id="v-phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+919876543210" />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="v-password">Temporary password</Label>
          <Input id="v-password" type="text" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Min 8 chars, letters + a number" />
        </div>
      </div>

      <FeedbackLine feedback={feedback} />

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create vendor account'}
        </Button>
      </div>
    </form>
  );
}

function SetPasswordForm({ account, onClose }: { account: Account; onClose: () => void }) {
  const setPassword = useSetUserPassword();
  const [password, setPassword2] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (password.length < 8) {
      setFeedback({ type: 'err', message: 'Password must be at least 8 characters (letters + a number).' });
      return;
    }
    setPassword.mutate(
      { id: account.id, newPassword: password },
      {
        onSuccess: () => setFeedback({ type: 'ok', message: 'Password updated. Share it securely.' }),
        onError: (err) => setFeedback({ type: 'err', message: errMessage(err) }),
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-gray-600">
        Set a new password for{' '}
        <span className="font-medium text-gray-900">
          {account.firstName} {account.lastName}
        </span>{' '}
        ({account.email}).
      </p>
      <div>
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="text"
          value={password}
          onChange={(e) => setPassword2(e.target.value)}
          placeholder="Min 8 chars, letters + a number"
        />
      </div>
      <FeedbackLine feedback={feedback} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button type="submit" disabled={setPassword.isPending}>
          {setPassword.isPending ? 'Saving…' : 'Set password'}
        </Button>
      </div>
    </form>
  );
}

function AccountRow({
  account,
  isSelf,
  canManage,
  onSetPassword,
}: {
  account: Account;
  isSelf: boolean;
  canManage: boolean;
  onSetPassword: (account: Account) => void;
}) {
  const suspend = useSuspendUser();
  const reactivate = useReactivateUser();
  const [error, setError] = useState<string | null>(null);
  const isSuspended = account.status === 'SUSPENDED' || account.status === 'DEACTIVATED';

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3">
        <div className="font-medium text-gray-900">
          {account.firstName} {account.lastName}
          {isSelf && <span className="ml-2 text-xs text-gray-400">(you)</span>}
        </div>
        <div className="text-xs text-gray-500">{account.email}</div>
        {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
      </td>
      <td className="px-4 py-3">
        <AccountTypeBadge type={account.accountType} />
      </td>
      <td className="px-4 py-3 text-gray-700">{account.organizationName ?? '—'}</td>
      <td className="px-4 py-3">
        <StatusBadge status={account.status} />
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">
        {account.lastLoginAt ? formatDate(account.lastLoginAt) : 'Never'}
      </td>
      <td className="px-4 py-3">
        {canManage ? (
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => onSetPassword(account)}>
              Password
            </Button>
            {isSuspended ? (
              <Button
                size="sm"
                onClick={() => {
                  setError(null);
                  reactivate.mutate(account.id, {
                    onError: (err) => setError(errMessage(err)),
                  });
                }}
                disabled={reactivate.isPending}
              >
                Reactivate
              </Button>
            ) : (
              <Button
                variant="danger"
                size="sm"
                disabled={isSelf || suspend.isPending}
                title={isSelf ? 'You cannot suspend your own account' : undefined}
                onClick={() => {
                  setError(null);
                  suspend.mutate(account.id, {
                    onError: (err) => setError(errMessage(err)),
                  });
                }}
              >
                Suspend
              </Button>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-400">Read-only</span>
        )}
      </td>
    </tr>
  );
}

export default function ManageAccountsPage() {
  const authz = useAuthz();
  const currentUserId = useAuthStore((s) => s.user?.id);
  const canManage = authz.can(PERMISSIONS.USER_SUSPEND);
  const canCreateVendor = authz.can(PERMISSIONS.VENDOR_CREATE);

  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [passwordFor, setPasswordFor] = useState<Account | null>(null);

  const { data, isLoading, isError, error } = useAccounts({
    page,
    pageSize: PAGE_SIZE,
    role: role || undefined,
    status: status || undefined,
    search: search.trim() || undefined,
    sort: '-createdAt',
  });

  if (!authz.can(PERMISSIONS.USER_VIEW)) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
        Account management is restricted to the Admin team.
      </div>
    );
  }

  const accounts = data?.data ?? [];
  const pagination = data?.pagination;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Accounts</h1>
          <p className="text-sm text-gray-500">
            Manage restaurant, vendor, and staff accounts — suspend, reset passwords, and onboard
            new vendors.
          </p>
        </div>
        {canCreateVendor && <Button onClick={() => setCreating(true)}>New vendor account</Button>}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select
          value={role}
          onChange={(e) => {
            setRole(e.target.value);
            setPage(1);
          }}
          className="w-44"
        >
          {ROLE_FILTERS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </Select>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="w-44"
        >
          {STATUS_FILTERS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search name or email…"
          className="w-64"
        />
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading accounts…</p>}
      {isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error instanceof ApiError ? error.message : 'Failed to load accounts'}
        </p>
      )}

      {data && accounts.length === 0 && (
        <p className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          No accounts match these filters.
        </p>
      )}

      {accounts.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Organization</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last login</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {accounts.map((account) => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    isSelf={account.id === currentUserId}
                    canManage={canManage}
                    onSetPassword={setPasswordFor}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <Button
            variant="secondary"
            size="sm"
            disabled={!pagination.hasPreviousPage}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-gray-600">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={!pagination.hasNextPage}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {creating && (
        <Modal title="New vendor account" onClose={() => setCreating(false)}>
          <CreateVendorForm onClose={() => setCreating(false)} />
        </Modal>
      )}

      {passwordFor && (
        <Modal title="Set password" onClose={() => setPasswordFor(null)}>
          <SetPasswordForm account={passwordFor} onClose={() => setPasswordFor(null)} />
        </Modal>
      )}
    </div>
  );
}
