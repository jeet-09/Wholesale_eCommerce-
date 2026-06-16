'use client';

import Link from 'next/link';

import { Card, CardBody, StatusBadge } from '@/components/ui/card';
import { useDashboard } from '@/hooks/use-dashboard';
import { useOrders } from '@/hooks/use-orders';
import { useVendorPerformanceList } from '@/hooks/use-performance';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { useAuthz } from '@/lib/authz';
import { formatDate, formatMoney } from '@/lib/format';
import type { DashboardMetric } from '@/lib/types';

const SCOPE_LABELS: Record<string, string> = {
  admin: 'Platform analytics',
  operations: 'Operations overview',
  vendor: 'Vendor overview',
  restaurant: 'Restaurant overview',
};

function formatMetric(metric: DashboardMetric): string {
  if (metric.value === null) {
    return metric.format === 'rating' ? 'No ratings' : '—';
  }
  switch (metric.format) {
    case 'currency':
      return formatMoney(String(metric.value));
    case 'percent':
      return `${metric.value}%`;
    case 'rating':
      return `${metric.value} / 5`;
    default:
      return metric.value.toLocaleString('en-IN');
  }
}

function MetricCard({ metric }: { metric: DashboardMetric }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs uppercase tracking-wide text-gray-500">{metric.label}</p>
        <p className="mt-1 text-2xl font-bold text-gray-900">{formatMetric(metric)}</p>
        {metric.hint && <p className="mt-0.5 text-xs text-gray-400">{metric.hint}</p>}
      </CardBody>
    </Card>
  );
}

/** Last few orders, scoped server-side to the viewer (own / assigned / all). */
function RecentOrders({ showParty }: { showParty: boolean }) {
  const { data, isLoading } = useOrders({ page: 1, pageSize: 5, sort: '-createdAt' });
  const orders = data?.data ?? [];

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Recent orders</h2>
          <Link href="/orders" className="text-sm font-medium text-brand-700 hover:underline">
            View all →
          </Link>
        </div>
        {isLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-gray-400">No orders yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                <th className="py-2">Order</th>
                {showParty && <th className="py-2">Restaurant</th>}
                <th className="py-2">Status</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2 text-right">Placed</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-gray-100">
                  <td className="py-2 font-medium text-gray-900">{order.orderNumber}</td>
                  {showParty && <td className="py-2 text-gray-600">{order.restaurantName ?? '—'}</td>}
                  <td className="py-2">
                    <StatusBadge status={order.status} />
                  </td>
                  <td className="py-2 text-right text-gray-700">{formatMoney(order.totalAmount)}</td>
                  <td className="py-2 text-right text-gray-500">
                    {formatDate(order.placedAt ?? order.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody>
    </Card>
  );
}

/** Top vendors by success rate (Administration / Admin monitoring). */
function TopVendors() {
  const { data, isLoading } = useVendorPerformanceList({ page: 1, pageSize: 50, sort: '-totalCompleted' });
  const top = [...(data?.data ?? [])]
    .sort((a, b) => b.successRate - a.successRate || b.totalCompleted - a.totalCompleted)
    .slice(0, 5);

  return (
    <Card>
      <CardBody>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">Top vendors</h2>
          <Link href="/vendors" className="text-sm font-medium text-brand-700 hover:underline">
            All scorecards →
          </Link>
        </div>
        {isLoading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : top.length === 0 ? (
          <p className="text-sm text-gray-400">No vendor activity yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                <th className="py-2">Vendor</th>
                <th className="py-2 text-right">Success</th>
                <th className="py-2 text-right">Completed</th>
                <th className="py-2 text-right">Rating</th>
              </tr>
            </thead>
            <tbody>
              {top.map((vendor) => (
                <tr key={vendor.vendorId} className="border-b border-gray-100">
                  <td className="py-2 font-medium text-gray-900">{vendor.vendorName ?? '—'}</td>
                  <td className="py-2 text-right text-gray-700">{vendor.successRate}%</td>
                  <td className="py-2 text-right text-gray-700">{vendor.totalCompleted}</td>
                  <td className="py-2 text-right text-gray-500">
                    {vendor.averageRating === null ? '—' : `${vendor.averageRating} / 5`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardBody>
    </Card>
  );
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const authz = useAuthz();
  const { data, isLoading, isError, error } = useDashboard();
  const isStaff = authz.isStaff;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {user ? `Welcome back, ${user.firstName}` : 'Dashboard'}
        </h1>
        <p className="text-sm text-gray-500">
          {data ? SCOPE_LABELS[data.scope] ?? 'Overview' : 'Overview'}
        </p>
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
              <MetricCard key={metric.key} metric={metric} />
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
                    <div
                      key={entry.status}
                      className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2"
                    >
                      <StatusBadge status={entry.status} />
                      <span className="text-sm font-semibold text-gray-900">{entry.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <div className={isStaff ? 'grid grid-cols-1 gap-6 lg:grid-cols-2' : ''}>
            <RecentOrders showParty={isStaff} />
            {isStaff && <TopVendors />}
          </div>
        </div>
      )}
    </div>
  );
}
