'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardBody, StatusBadge } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { useOrderCalls, useLogCall } from '@/hooks/use-calls';
import {
  useAssignVendor,
  useCancelOrder,
  useCompleteOrder,
  useOrder,
  useOrders,
  useRejectOrder,
  useUpdateFulfilment,
  useVendorRespond,
} from '@/hooks/use-orders';
import { useOrderPayments, useRejectPayment, useSubmitPayment, useVerifyPayment } from '@/hooks/use-payments';
import { useVendors } from '@/hooks/use-vendors';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { formatDate, formatMoney, formatQuantity, titleCase } from '@/lib/format';
import type { Order, Payment } from '@/lib/types';

const STATUS_FILTERS = [
  'PENDING_PAYMENT',
  'PAYMENT_RECEIVED',
  'PENDING_ADMIN_REVIEW',
  'VENDOR_ASSIGNED',
  'VENDOR_ACCEPTED',
  'PROCESSING',
  'READY_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
  'REJECTED',
];

const FULFILMENT_NEXT: Record<string, string> = {
  VENDOR_ACCEPTED: 'PROCESSING',
  PROCESSING: 'READY_FOR_DELIVERY',
  READY_FOR_DELIVERY: 'DELIVERED',
};

const CALL_OUTCOMES = ['ACCEPTED', 'REJECTED', 'NO_RESPONSE', 'PARTIAL'];

function errMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900">{value}</dd>
    </div>
  );
}

// --- Payments ---------------------------------------------------------------

function PaymentsSection({ order, isRestaurant, isStaff }: { order: Order; isRestaurant: boolean; isStaff: boolean }) {
  const { data: payments } = useOrderPayments(order.id);
  const submit = useSubmitPayment();
  const verify = useVerifyPayment();
  const reject = useRejectPayment();
  const [proofUrl, setProofUrl] = useState('');
  const [ref, setRef] = useState('');
  const [error, setError] = useState<string | null>(null);

  const list: Payment[] = payments ?? order.payments ?? [];
  const canSubmit = isRestaurant && order.status === 'PENDING_PAYMENT';

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!proofUrl.trim()) {
      setError('A proof URL is required.');
      return;
    }
    submit.mutate(
      { orderId: order.id, proofUrl: proofUrl.trim(), transactionReference: ref.trim() || undefined },
      {
        onSuccess: () => {
          setProofUrl('');
          setRef('');
        },
        onError: (err) => setError(errMsg(err, 'Failed to submit payment')),
      },
    );
  };

  return (
    <div className="border-t border-gray-100 pt-4">
      <h3 className="mb-2 text-sm font-medium text-gray-700">
        Advance payment · {formatMoney(order.advanceAmount, order.currency)} ({order.advancePercent}%)
      </h3>

      {list.length > 0 ? (
        <ul className="mb-3 space-y-2">
          {list.map((p) => (
            <li key={p.id} className="rounded-md border border-gray-200 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900">
                  {titleCase(p.paymentType)} · {formatMoney(p.amount, p.currency)}
                </span>
                <StatusBadge status={p.status} />
              </div>
              {p.transactionReference && (
                <p className="mt-1 text-xs text-gray-500">Ref: {p.transactionReference}</p>
              )}
              {p.proofUrl && (
                <a
                  href={p.proofUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-xs font-medium text-brand-700 hover:underline"
                >
                  View proof
                </a>
              )}
              {p.remarks && <p className="mt-1 text-xs text-red-600">{p.remarks}</p>}
              {isStaff && p.status === 'SUBMITTED' && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => verify.mutate(p.id)} disabled={verify.isPending}>
                    Verify
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => reject.mutate({ id: p.id, reason: 'Proof not valid' })}
                    disabled={reject.isPending}
                  >
                    Reject
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-xs text-gray-400">No payments submitted yet.</p>
      )}

      {canSubmit && (
        <form onSubmit={onSubmit} className="space-y-2 rounded-md bg-gray-50 p-3">
          <p className="text-xs text-gray-500">
            Pay {formatMoney(order.advanceAmount, order.currency)} via the PhonePe QR and paste the
            proof link below.
          </p>
          <div>
            <Label htmlFor="proof-url">Payment proof URL</Label>
            <Input
              id="proof-url"
              value={proofUrl}
              onChange={(e) => setProofUrl(e.target.value)}
              placeholder="https://…/screenshot.png"
            />
          </div>
          <div>
            <Label htmlFor="proof-ref">Transaction reference (optional)</Label>
            <Input id="proof-ref" value={ref} onChange={(e) => setRef(e.target.value)} />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <Button type="submit" size="sm" disabled={submit.isPending}>
            {submit.isPending ? 'Submitting…' : 'Submit payment proof'}
          </Button>
        </form>
      )}
    </div>
  );
}

// --- Administration: assign vendor + log calls ------------------------------

function AdminActions({ order }: { order: Order }) {
  const assign = useAssignVendor();
  const complete = useCompleteOrder();
  const reject = useRejectOrder();
  const logCall = useLogCall();
  const { data: vendorsData } = useVendors({ status: 'ACTIVE', pageSize: 100 });
  const { data: calls } = useOrderCalls(order.id, Boolean(order.assignedVendorId) || order.status === 'PENDING_ADMIN_REVIEW');

  const [vendorId, setVendorId] = useState('');
  const [rating, setRating] = useState('5');
  const [callOutcome, setCallOutcome] = useState('NO_RESPONSE');
  const [error, setError] = useState<string | null>(null);

  const vendors = vendorsData?.data ?? [];
  const canAssign = order.status === 'PENDING_ADMIN_REVIEW';
  const canComplete = order.status === 'DELIVERED';
  const canReject = ['PENDING_ADMIN_REVIEW', 'VENDOR_ASSIGNED', 'VENDOR_ACCEPTED', 'PROCESSING'].includes(
    order.status,
  );
  const callTarget = vendorId || order.assignedVendorId || '';

  return (
    <div className="space-y-3 border-t border-gray-100 pt-4">
      <h3 className="text-sm font-medium text-gray-700">Administration</h3>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {canAssign && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="assign-vendor">Assign vendor</Label>
            <Select id="assign-vendor" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              <option value="">Select a vendor…</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.vendorName}
                </option>
              ))}
            </Select>
          </div>
          <Button
            onClick={() => {
              setError(null);
              if (!vendorId) {
                setError('Select a vendor to assign.');
                return;
              }
              assign.mutate(
                { id: order.id, vendorId },
                { onError: (err) => setError(errMsg(err, 'Assignment failed')) },
              );
            }}
            disabled={assign.isPending}
          >
            Assign
          </Button>
        </div>
      )}

      {canComplete && (
        <div className="flex items-end gap-2">
          <div className="w-28">
            <Label htmlFor="rating">Rating (1-5)</Label>
            <Select id="rating" value={rating} onChange={(e) => setRating(e.target.value)}>
              {[1, 2, 3, 4, 5].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </Select>
          </div>
          <Button
            onClick={() => {
              setError(null);
              complete.mutate(
                { id: order.id, rating: Number(rating) },
                { onError: (err) => setError(errMsg(err, 'Completion failed')) },
              );
            }}
            disabled={complete.isPending}
          >
            Mark completed
          </Button>
        </div>
      )}

      {(canAssign || order.assignedVendorId) && (
        <div className="rounded-md bg-gray-50 p-3">
          <p className="mb-2 text-xs font-medium text-gray-600">Log a vendor call</p>
          <div className="flex items-end gap-2">
            {canAssign && (
              <div className="flex-1">
                <Label htmlFor="call-vendor">Vendor</Label>
                <Select id="call-vendor" value={callTarget} onChange={(e) => setVendorId(e.target.value)}>
                  <option value="">Select…</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.vendorName}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="flex-1">
              <Label htmlFor="call-outcome">Outcome</Label>
              <Select id="call-outcome" value={callOutcome} onChange={(e) => setCallOutcome(e.target.value)}>
                {CALL_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {titleCase(o)}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                setError(null);
                if (!callTarget) {
                  setError('Select a vendor for the call.');
                  return;
                }
                logCall.mutate(
                  { orderId: order.id, vendorId: callTarget, outcome: callOutcome },
                  { onError: (err) => setError(errMsg(err, 'Failed to log call')) },
                );
              }}
              disabled={logCall.isPending}
            >
              Log call
            </Button>
          </div>
          {calls && calls.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs text-gray-500">
              {calls.map((c) => (
                <li key={c.id}>
                  {formatDate(c.createdAt)} — {c.vendorName ?? 'Vendor'}: {titleCase(c.outcome)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {canReject && (
        <Button
          variant="danger"
          size="sm"
          onClick={() => {
            setError(null);
            reject.mutate(
              { id: order.id, reason: 'Rejected by administration' },
              { onError: (err) => setError(errMsg(err, 'Reject failed')) },
            );
          }}
          disabled={reject.isPending}
        >
          Reject order
        </Button>
      )}
    </div>
  );
}

// --- Vendor actions ---------------------------------------------------------

function VendorActions({ order }: { order: Order }) {
  const respond = useVendorRespond();
  const fulfil = useUpdateFulfilment();
  const [error, setError] = useState<string | null>(null);

  const nextStatus = FULFILMENT_NEXT[order.status];

  return (
    <div className="space-y-3 border-t border-gray-100 pt-4">
      <h3 className="text-sm font-medium text-gray-700">Vendor actions</h3>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {order.status === 'VENDOR_ASSIGNED' && (
        <div className="flex gap-2">
          <Button
            onClick={() => {
              setError(null);
              respond.mutate(
                { id: order.id, accept: true },
                { onError: (err) => setError(errMsg(err, 'Failed to accept')) },
              );
            }}
            disabled={respond.isPending}
          >
            Accept assignment
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              setError(null);
              respond.mutate(
                { id: order.id, accept: false },
                { onError: (err) => setError(errMsg(err, 'Failed to reject')) },
              );
            }}
            disabled={respond.isPending}
          >
            Decline
          </Button>
        </div>
      )}

      {nextStatus && (
        <Button
          onClick={() => {
            setError(null);
            fulfil.mutate(
              { id: order.id, status: nextStatus },
              { onError: (err) => setError(errMsg(err, 'Update failed')) },
            );
          }}
          disabled={fulfil.isPending}
        >
          Mark {nextStatus.replace(/_/g, ' ').toLowerCase()}
        </Button>
      )}
    </div>
  );
}

function OrderDetail({ orderId }: { orderId: string }) {
  const context = useAuthStore((s) => s.context);
  const { data: order, isLoading, isError, error } = useOrder(orderId);
  const cancelOrder = useCancelOrder();
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) return <p className="text-sm text-gray-500">Loading order…</p>;
  if (isError)
    return (
      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        {error instanceof ApiError ? error.message : 'Failed to load order'}
      </p>
    );
  if (!order) return null;

  const roles = context?.roles ?? [];
  const isStaff = roles.includes('ADMIN') || roles.includes('OPERATIONS');
  const isVendor = Boolean(context?.vendorId) && order.assignedVendorId === context?.vendorId;
  const isRestaurant = Boolean(context?.restaurantId) && order.restaurantId === context?.restaurantId;
  const canCancel =
    (isRestaurant || isStaff) &&
    ['PENDING_PAYMENT', 'PAYMENT_RECEIVED', 'PENDING_ADMIN_REVIEW'].includes(order.status);

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
          <p>Restaurant: {order.restaurantName ?? '—'}</p>
          <p>Vendor: {order.assignedVendorName ?? 'Not yet assigned'}</p>
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
          <Row label="Subtotal" value={formatMoney(order.subtotal)} />
          <Row label="GST" value={formatMoney(order.gstAmount)} />
          <Row label="Delivery" value={formatMoney(order.deliveryCharges)} />
          <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold text-gray-900">
            <dt>Total</dt>
            <dd>{formatMoney(order.totalAmount)}</dd>
          </div>
          <Row label={`Advance (${order.advancePercent}%)`} value={formatMoney(order.advanceAmount)} />
          <Row label="Balance on delivery" value={formatMoney(order.remainingAmount)} />
        </dl>

        <PaymentsSection order={order} isRestaurant={isRestaurant} isStaff={isStaff} />

        {isStaff && <AdminActions order={order} />}
        {isVendor && <VendorActions order={order} />}

        {canCancel && (
          <div className="border-t border-gray-100 pt-4">
            {actionError && (
              <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
            )}
            <Button
              variant="danger"
              onClick={() => {
                setActionError(null);
                cancelOrder.mutate(
                  { id: order.id },
                  { onError: (err) => setActionError(errMsg(err, 'Cancel failed')) },
                );
              }}
              disabled={cancelOrder.isPending}
            >
              Cancel order
            </Button>
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
          className="w-56"
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
                <span>{order.assignedVendorName ?? order.restaurantName ?? '—'}</span>
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
