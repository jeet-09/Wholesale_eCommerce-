'use client';

import Link from 'next/link';

import { Card, CardBody, StatusBadge } from '@/components/ui/card';
import { useDashboard } from '@/hooks/use-dashboard';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';

const SCOPE_LABELS: Record<string, string> = {
  admin: 'Administration overview',
  vendor: 'Vendor overview',
  restaurant: 'Restaurant overview',
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, isError, error } = useDashboard();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {user ? `Welcome back, ${user.firstName}` : 'Dashboard'}
        </h1>
        <p className="text-sm text-gray-500">{data ? SCOPE_LABELS[data.scope] ?? 'Overview' : 'Overview'}</p>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading dashboard…</p>}
      {isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error instanceof ApiError ? error.message : 'Failed to load dashboard'}
        </p>
      )}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {data.metrics.map((metric) => (
              <Card key={metric.key}>
                <CardBody>
                  <p className="text-xs uppercase tracking-wide text-gray-500">{metric.label}</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{metric.value.toLocaleString('en-IN')}</p>
                </CardBody>
              </Card>
            ))}
          </div>

          <Card>
            <CardBody>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Orders by status</h2>
                <Link href="/orders" className="text-sm font-medium text-brand-700 hover:underline">
                  View orders →
                </Link>
              </div>
              {data.ordersByStatus.length === 0 ? (
                <p className="text-sm text-gray-400">No orders yet.</p>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {data.ordersByStatus.map((entry) => (
                    <div key={entry.status} className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2">
                      <StatusBadge status={entry.status} />
                      <span className="text-sm font-semibold text-gray-900">{entry.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
