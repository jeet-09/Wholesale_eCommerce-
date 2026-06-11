'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardBody, StatusBadge } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import {
  useCancelOrder,
  useOrder,
  useOrders,
  useUpdateOrderStatus,
} from '@/hooks/use-orders';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { formatDate, formatMoney, formatQuantity, titleCase } from '@/lib/format';

const STATUS_FILTERS = [
  'PENDING',
  'ACCEPTED',
  'PROCESSING',
  'READY_FOR_DISPATCH',
  'DELIVERED',
  'CANCELLED',
  'REJECTED',
];

const VENDOR_NEXT_STATUSES = [
  'ACCEPTED',
  'PROCESSING',
  'READY_FOR_DISPATCH',
  'DELIVERED',
  'REJECTED',
];

function OrderDetail({ orderId }: { orderId: string }) {
  const context = useAuthStore((s) => s.context);
  const { data: order, isLoading, isError, error } = useOrder(orderId);
  const updateStatus = useUpdateOrderStatus();
  const cancelOrder = useCancelOrder();
  const [nextStatus, setNextStatus] = useState('ACCEPTED');
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) return <p className="text-sm text-gray-500">Loading order…</p>;
  if (isError)
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        {error instanceof ApiError ? error.message : 'Failed to load order'}
      </p>
    );
  if (!order) return null;

  const isVendor = Boolean(context?.vendorId);
  const isRestaurant = Boolean(context?.restaurantId);
  const canCancel = isRestaurant && ['PENDING', 'ACCEPTED'].includes(order.status);
  const canUpdate = isVendor && !['DELIVERED', 'CANCELLED', 'REJECTED'].includes(order.status);

  const onUpdate = () => {
    setActionError(null);
    updateStatus.mutate(
      { id: order.id, status: nextStatus },
      { onError: (err) => setActionError(err instanceof ApiError ? err.message : 'Update failed') },
    );
  };

  const onCancel = () => {
    setActionError(null);
    cancelOrder.mutate(
      { id: order.id },
      { onError: (err) => setActionError(err instanceof ApiError ? err.message : 'Cancel failed') },
    );
  };

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{order.orderNumber}</h2>
            <p className="text-xs text-gray-500">Placed {formatDate(order.placedAt)}</p>
          </div>
          <StatusBadge status={order.status} />
        </div>

        <div className="text-sm text-gray-600">
          <p>Vendor: {order.vendorName ?? '—'}</p>
          <p>Restaurant: {order.restaurantName ?? '—'}</p>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Price</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id} className="border-b border-gray-100">
                <td className="py-2">
                  {item.productName}
                  <span className="ml-1 text-xs text-gray-400">({titleCase(item.unit)})</span>
                </td>
                <td className="py-2 text-right">{formatMoney(item.unitPrice)}</td>
                <td className="py-2 text-right">{formatQuantity(item.quantity)}</td>
                <td className="py-2 text-right">{formatMoney(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">Subtotal</dt>
            <dd>{formatMoney(order.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">GST</dt>
            <dd>{formatMoney(order.gstAmount)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">Delivery</dt>
            <dd>{formatMoney(order.deliveryCharges)}</dd>
          </div>
          <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold text-gray-900">
            <dt>Total</dt>
            <dd>{formatMoney(order.totalAmount)}</dd>
          </div>
        </dl>

        {(canUpdate || canCancel) && (
          <div className="border-t border-gray-100 pt-4">
            {actionError && (
              <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
            )}
            {canUpdate && (
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-gray-500">
                    Update status
                  </label>
                  <Select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
                    {VENDOR_NEXT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </Select>
                </div>
                <Button onClick={onUpdate} disabled={updateStatus.isPending}>
                  Apply
                </Button>
              </div>
            )}
            {canCancel && (
              <Button
                variant="danger"
                className="mt-3"
                onClick={onCancel}
                disabled={cancelOrder.isPending}
              >
                Cancel order
              </Button>
            )}
          </div>
        )}

        {order.statusHistory.length > 0 && (
          <div className="border-t border-gray-100 pt-4">
            <h3 className="mb-2 text-sm font-medium text-gray-700">History</h3>
            <ul className="space-y-1 text-xs text-gray-500">
              {order.statusHistory.map((h) => (
                <li key={h.id}>
                  {formatDate(h.createdAt)} — {h.oldStatus ? `${h.oldStatus} → ` : ''}
                  {h.newStatus}
                  {h.remarks ? ` (${h.remarks})` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function OrdersPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data, isLoading, isError, error } = useOrders({
    page,
    pageSize: 10,
    status: status || undefined,
    sort: '-createdAt',
  });

  const pagination = data?.pagination;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="w-52"
        >
          <option value="">All statuses</option>
          {STATUS_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, ' ')}
            </option>
          ))}
        </Select>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading orders…</p>}
      {isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error instanceof ApiError ? error.message : 'Failed to load orders'}
        </p>
      )}

      {data && data.data.length === 0 && (
        <p className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          No orders yet.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          {data?.data.map((order) => (
            <button
              key={order.id}
              onClick={() => setSelectedId(order.id)}
              className={`w-full rounded-lg border bg-white p-4 text-left shadow-sm transition-colors hover:border-brand-500 ${
                selectedId === order.id ? 'border-brand-600 ring-1 ring-brand-600' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">{order.orderNumber}</span>
                <StatusBadge status={order.status} />
              </div>
              <div className="mt-1 flex items-center justify-between text-sm text-gray-500">
                <span>{order.vendorName ?? order.restaurantName ?? '—'}</span>
                <span className="font-medium text-gray-900">{formatMoney(order.totalAmount)}</span>
              </div>
              <p className="mt-1 text-xs text-gray-400">{formatDate(order.placedAt ?? order.createdAt)}</p>
            </button>
          ))}

          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={!pagination.hasPreviousPage}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs text-gray-500">
                Page {pagination.page} / {pagination.totalPages}
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
        </div>

        <div>
          {selectedId ? (
            <OrderDetail orderId={selectedId} />
          ) : (
            <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
              Select an order to view details.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
