'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Badge, Card, CardBody, StatusBadge } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { useOrderCalls, useLogCall } from '@/hooks/use-calls';
import {
  useAssignVendor,
  useCancelOrder,
  useCompleteOrder,
  useOrder,
  useOrders,
  useOverrideOrderStatus,
  useRejectOrder,
  useUpdateFulfilment,
  useVendorRespond,
  type DispatchItemInput,
} from '@/hooks/use-orders';
import { useOrderPayments, useRejectPayment, useSubmitPayment, useVerifyPayment } from '@/hooks/use-payments';
import { useVendors } from '@/hooks/use-vendors';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import {
  formatDate,
  formatDateOnly,
  formatMoney,
  formatQuantity,
  relativeDay,
  titleCase,
} from '@/lib/format';
import type { Order, OrderItem, Payment } from '@/lib/types';

type Tab = 'ACTIVE' | 'ARCHIVED';

const ACTIVE_STATUSES = [
  'PENDING_PAYMENT',
  'PAYMENT_RECEIVED',
  'PENDING_ADMIN_REVIEW',
  'VENDOR_ASSIGNED',
  'VENDOR_ACCEPTED',
  'PROCESSING',
  'READY_FOR_DELIVERY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

const ARCHIVED_STATUSES = ['COMPLETED', 'CANCELLED', 'REJECTED'];

// Ordered milestones for the card status stepper (terminal states handled apart).
const LIFECYCLE: { status: string; label: string }[] = [
  { status: 'PENDING_PAYMENT', label: 'Placed' },
  { status: 'PAYMENT_RECEIVED', label: 'Paid' },
  { status: 'PENDING_ADMIN_REVIEW', label: 'Review' },
  { status: 'VENDOR_ASSIGNED', label: 'Assigned' },
  { status: 'VENDOR_ACCEPTED', label: 'Accepted' },
  { status: 'PROCESSING', label: 'Processing' },
  { status: 'READY_FOR_DELIVERY', label: 'Ready' },
  { status: 'OUT_FOR_DELIVERY', label: 'In delivery' },
  { status: 'DELIVERED', label: 'Delivered' },
  { status: 'COMPLETED', label: 'Completed' },
];

const CALL_OUTCOMES = ['ACCEPTED', 'REJECTED', 'NO_RESPONSE', 'PARTIAL'];

// Any status an admin can force an order into (DRAFT excluded — pre-placement).
const OVERRIDE_STATUSES = [
  'PENDING_PAYMENT',
  'PAYMENT_RECEIVED',
  'PENDING_ADMIN_REVIEW',
  'VENDOR_ASSIGNED',
  'VENDOR_ACCEPTED',
  'PROCESSING',
  'READY_FOR_DELIVERY',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
  'REJECTED',
  'CANCELLED',
];

function errMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

function isPartialLine(item: OrderItem): boolean {
  return item.deliveredQuantity !== null && Number(item.deliveredQuantity) < Number(item.quantity);
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900">{value}</dd>
    </div>
  );
}

// --- Reusable card widgets --------------------------------------------------

function Stars({ value }: { value: number }) {
  return (
    <span aria-label={`${value} out of 5 stars`} className="text-base leading-none">
      <span className="text-amber-500">{'★'.repeat(value)}</span>
      <span className="text-gray-300">{'★'.repeat(Math.max(0, 5 - value))}</span>
    </span>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Your rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-pressed={n === value}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={`text-2xl leading-none transition-colors hover:text-amber-400 ${
            n <= value ? 'text-amber-500' : 'text-gray-300'
          }`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function StatusStepper({ status }: { status: string }) {
  if (status === 'REJECTED' || status === 'CANCELLED') {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
        This order was {status === 'REJECTED' ? 'rejected by Administration' : 'cancelled'}.
      </div>
    );
  }
  const currentIdx = LIFECYCLE.findIndex((s) => s.status === status);
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {LIFECYCLE.map((step, i) => {
        const done = currentIdx >= 0 && i < currentIdx;
        const active = i === currentIdx;
        return (
          <li key={step.status} className="flex items-center gap-1">
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                active
                  ? 'bg-brand-600 text-white'
                  : done
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-200 text-gray-500'
              }`}
            >
              {done ? '✓' : i + 1}
            </span>
            <span
              className={`text-[11px] ${active ? 'font-semibold text-gray-900' : 'text-gray-500'}`}
            >
              {step.label}
            </span>
            {i < LIFECYCLE.length - 1 && <span className="text-gray-300">›</span>}
          </li>
        );
      })}
    </ol>
  );
}

function DeliveryInfo({ order }: { order: Order }) {
  const countdown = relativeDay(order.requestedDeliveryDate);
  return (
    <div className="grid grid-cols-2 gap-3 rounded-md bg-gray-50 p-3 text-sm sm:grid-cols-4">
      <div>
        <p className="text-[11px] uppercase tracking-wide text-gray-400">Delivery date</p>
        <p className="font-medium text-gray-900">{formatDateOnly(order.requestedDeliveryDate)}</p>
        {countdown && <p className="text-xs text-gray-500">{countdown}</p>}
      </div>
      {order.isSameDayDelivery && Number(order.sameDayCharge) > 0 && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-400">Same-day surcharge</p>
          <p className="font-medium text-amber-700">+{formatMoney(order.sameDayCharge)}</p>
        </div>
      )}
      {order.deliveryContactPhone && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-400">Delivery contact</p>
          <a
            href={`tel:${order.deliveryContactPhone}`}
            className="font-medium text-brand-700 hover:underline"
          >
            {order.deliveryContactPhone}
          </a>
        </div>
      )}
      {order.dispatchedAt && (
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-400">Dispatched</p>
          <p className="font-medium text-gray-900">{formatDate(order.dispatchedAt)}</p>
        </div>
      )}
      {order.dispatchNote && (
        <div className="col-span-2 sm:col-span-4">
          <p className="text-[11px] uppercase tracking-wide text-gray-400">Dispatch note</p>
          <p className="text-gray-700">{order.dispatchNote}</p>
        </div>
      )}
    </div>
  );
}

function ReviewDisplay({ order }: { order: Order }) {
  if (!order.customerRating) return null;
  return (
    <div className="border-t border-gray-100 pt-4">
      <h3 className="mb-2 text-sm font-medium text-gray-700">Customer review</h3>
      <Stars value={order.customerRating} />
      {order.customerReview && (
        <p className="mt-1 text-sm italic text-gray-700">“{order.customerReview}”</p>
      )}
      <p className="mt-1 text-xs text-gray-400">{formatDate(order.ratedAt)}</p>
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

// --- Administration: assign vendor + complete fallback + log calls ----------

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
            <Label htmlFor="assign-vendor">Assign to vendor</Label>
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

// --- Admin super-power: force any status ------------------------------------

function AdminOverride({ order }: { order: Order }) {
  const override = useOverrideOrderStatus();
  const [status, setStatus] = useState(order.status);
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  return (
    <div className="space-y-2 rounded-md border border-dashed border-amber-300 bg-amber-50/60 p-3">
      <h3 className="text-sm font-semibold text-amber-900">Admin override · force status</h3>
      <p className="text-xs text-amber-700">
        Set this order to any status, bypassing the normal flow. To route an order to a vendor, use{' '}
        <span className="font-medium">Assign</span> above (it reserves stock). Overrides are recorded
        in the order history.
      </p>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {done && <p className="text-xs font-medium text-green-700">Status updated.</p>}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Label htmlFor="override-status">New status</Label>
          <Select id="override-status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {OVERRIDE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            setError(null);
            setDone(false);
            if (status === order.status) {
              setError('Pick a different status to apply.');
              return;
            }
            override.mutate(
              { id: order.id, status, remarks: remarks.trim() || undefined },
              {
                onSuccess: () => {
                  setDone(true);
                  setRemarks('');
                },
                onError: (err) => setError(errMsg(err, 'Override failed')),
              },
            );
          }}
          disabled={override.isPending}
        >
          {override.isPending ? 'Applying…' : 'Apply'}
        </Button>
      </div>
      <div>
        <Label htmlFor="override-remarks">Reason (optional)</Label>
        <Input
          id="override-remarks"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Why are you overriding the status?"
        />
      </div>
    </div>
  );
}

// --- Vendor actions ---------------------------------------------------------

function VendorActions({ order }: { order: Order }) {
  const respond = useVendorRespond();
  const fulfil = useUpdateFulfilment();
  const [error, setError] = useState<string | null>(null);

  // Dispatch ("in delivery") form state.
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [showPartial, setShowPartial] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(order.items.map((i) => [i.id, i.quantity])),
  );

  const advance = (status: string, onDone?: () => void) => {
    setError(null);
    fulfil.mutate(
      { id: order.id, status },
      { onError: (err) => setError(errMsg(err, 'Update failed')), onSuccess: onDone },
    );
  };

  const dispatch = () => {
    setError(null);
    if (!phone.trim()) {
      setError('Enter the delivery person’s phone number.');
      return;
    }
    const deliveredItems: DispatchItemInput[] = showPartial
      ? order.items
          .filter((i) => qty[i.id] !== '' && Number(qty[i.id]) !== Number(i.quantity))
          .map((i) => ({ orderItemId: i.id, deliveredQuantity: Number(qty[i.id]) }))
      : [];
    fulfil.mutate(
      {
        id: order.id,
        status: 'OUT_FOR_DELIVERY',
        deliveryContactPhone: phone.trim(),
        dispatchNote: note.trim() || undefined,
        deliveredItems: deliveredItems.length > 0 ? deliveredItems : undefined,
      },
      { onError: (err) => setError(errMsg(err, 'Dispatch failed')) },
    );
  };

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
                { onError: (err) => setError(errMsg(err, 'Failed to decline')) },
              );
            }}
            disabled={respond.isPending}
          >
            Decline
          </Button>
        </div>
      )}

      {order.status === 'VENDOR_ACCEPTED' && (
        <Button onClick={() => advance('PROCESSING')} disabled={fulfil.isPending}>
          Start processing
        </Button>
      )}

      {order.status === 'PROCESSING' && (
        <Button onClick={() => advance('READY_FOR_DELIVERY')} disabled={fulfil.isPending}>
          Mark ready for delivery
        </Button>
      )}

      {order.status === 'READY_FOR_DELIVERY' && (
        <div className="space-y-3 rounded-md bg-gray-50 p-3">
          <p className="text-xs font-medium text-gray-600">Dispatch order (out for delivery)</p>
          <div>
            <Label htmlFor="delivery-phone">Delivery person’s phone</Label>
            <Input
              id="delivery-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
            />
          </div>
          <div>
            <Label htmlFor="dispatch-note">Dispatch note (optional)</Label>
            <Input
              id="dispatch-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. driver name, vehicle no."
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={showPartial}
              onChange={(e) => setShowPartial(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600"
            />
            Some items short — enter the actual quantity sent
          </label>

          {showPartial && (
            <div className="space-y-2">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex-1 text-gray-700">
                    {item.productName}
                    <span className="ml-1 text-xs text-gray-400">
                      (ordered {formatQuantity(item.quantity)} {titleCase(item.unit)})
                    </span>
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    value={qty[item.id] ?? ''}
                    onChange={(e) => setQty((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    className="w-28"
                    aria-label={`Quantity sent for ${item.productName}`}
                  />
                </div>
              ))}
            </div>
          )}

          <Button onClick={dispatch} disabled={fulfil.isPending}>
            {fulfil.isPending ? 'Dispatching…' : 'Mark out for delivery'}
          </Button>
        </div>
      )}

      {order.status === 'OUT_FOR_DELIVERY' && (
        <Button onClick={() => advance('DELIVERED')} disabled={fulfil.isPending}>
          Mark delivered
        </Button>
      )}
    </div>
  );
}

// --- Restaurant: confirm + 5-star review ------------------------------------

function RestaurantReview({ order }: { order: Order }) {
  const complete = useCompleteOrder();
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (order.status !== 'DELIVERED') return null;

  return (
    <div className="space-y-3 border-t border-gray-100 pt-4">
      <h3 className="text-sm font-medium text-gray-700">Confirm delivery & rate your order</h3>
      <p className="text-xs text-gray-500">
        Your order was marked delivered. Confirm receipt and leave a rating to complete it.
      </p>
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div>
        <Label>Your rating</Label>
        <StarPicker value={rating} onChange={setRating} />
      </div>
      <div>
        <Label htmlFor="review">Review (optional)</Label>
        <textarea
          id="review"
          value={review}
          onChange={(e) => setReview(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="How was the quality and delivery?"
          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
        />
      </div>
      <Button
        onClick={() => {
          setError(null);
          complete.mutate(
            { id: order.id, rating, review: review.trim() || undefined },
            { onError: (err) => setError(errMsg(err, 'Failed to complete order')) },
          );
        }}
        disabled={complete.isPending}
      >
        {complete.isPending ? 'Submitting…' : 'Confirm & submit review'}
      </Button>
    </div>
  );
}

// --- Order detail card ------------------------------------------------------

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
  const isAdmin = roles.includes('ADMIN');
  const isStaff = isAdmin || roles.includes('OPERATIONS');
  const isVendor = Boolean(context?.vendorId) && order.assignedVendorId === context?.vendorId;
  const isRestaurant = Boolean(context?.restaurantId) && order.restaurantId === context?.restaurantId;
  const canCancel =
    (isRestaurant || isStaff) &&
    ['PENDING_PAYMENT', 'PAYMENT_RECEIVED', 'PENDING_ADMIN_REVIEW'].includes(order.status);
  const showSent = order.items.some((i) => i.deliveredQuantity !== null);

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{order.orderNumber}</h2>
            <p className="text-xs text-gray-500">Placed {formatDate(order.placedAt)}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={order.status} />
            {order.isSameDayDelivery && (
              <Badge className="bg-amber-100 text-amber-800">Same-day</Badge>
            )}
          </div>
        </div>

        <StatusStepper status={order.status} />

        <DeliveryInfo order={order} />

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
              {showSent && <th className="py-2 text-right">Sent</th>}
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
                {showSent && (
                  <td
                    className={`py-2 text-right ${
                      isPartialLine(item) ? 'font-medium text-amber-700' : 'text-gray-700'
                    }`}
                  >
                    {item.deliveredQuantity !== null ? formatQuantity(item.deliveredQuantity) : '—'}
                  </td>
                )}
                <td className="py-2 text-right">{formatMoney(item.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ml-auto w-full max-w-xs space-y-1 text-sm">
          <Row label="Subtotal" value={formatMoney(order.subtotal)} />
          <Row label="GST" value={formatMoney(order.gstAmount)} />
          <Row label="Delivery" value={formatMoney(order.deliveryCharges)} />
          {order.isSameDayDelivery && Number(order.sameDayCharge) > 0 && (
            <Row
              label="• incl. same-day"
              value={<span className="text-amber-700">+{formatMoney(order.sameDayCharge)}</span>}
            />
          )}
          <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold text-gray-900">
            <dt>Total</dt>
            <dd>{formatMoney(order.totalAmount)}</dd>
          </div>
          <Row label={`Advance (${order.advancePercent}%)`} value={formatMoney(order.advanceAmount)} />
          <Row label="Balance on delivery" value={formatMoney(order.remainingAmount)} />
        </dl>

        <PaymentsSection order={order} isRestaurant={isRestaurant} isStaff={isStaff} />

        {isStaff && <AdminActions key={order.id} order={order} />}
        {isAdmin && <AdminOverride key={`override-${order.id}`} order={order} />}
        {isVendor && <VendorActions key={order.id} order={order} />}
        {isRestaurant && <RestaurantReview key={order.id} order={order} />}

        <ReviewDisplay order={order} />

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

// --- Board (list of order cards) --------------------------------------------

function OrderCard({
  order,
  selected,
  onSelect,
}: {
  order: Order;
  selected: boolean;
  onSelect: () => void;
}) {
  const countdown = relativeDay(order.requestedDeliveryDate);
  return (
    <button
      onClick={onSelect}
      className={`w-full rounded-lg border bg-white p-4 text-left shadow-sm transition-colors hover:border-brand-500 ${
        selected ? 'border-brand-600 ring-1 ring-brand-600' : 'border-gray-200'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-gray-900">{order.orderNumber}</span>
        <div className="flex items-center gap-1">
          {order.isSameDayDelivery && (
            <Badge className="bg-amber-100 text-amber-800">Same-day</Badge>
          )}
          <StatusBadge status={order.status} />
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between text-sm text-gray-500">
        <span className="truncate">
          {order.restaurantName ?? '—'}
          {order.assignedVendorName ? ` → ${order.assignedVendorName}` : ''}
        </span>
        <span className="font-medium text-gray-900">{formatMoney(order.totalAmount)}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
        <span>Placed {formatDate(order.placedAt ?? order.createdAt)}</span>
        {order.requestedDeliveryDate && (
          <span>
            Deliver {formatDateOnly(order.requestedDeliveryDate)}
            {countdown ? ` · ${countdown}` : ''}
          </span>
        )}
      </div>
    </button>
  );
}

export default function OrdersPage() {
  const [tab, setTab] = useState<Tab>('ACTIVE');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useOrders({
    page,
    pageSize: 10,
    statusGroup: tab,
    status: status || undefined,
    sort: '-createdAt',
  });

  const pagination = data?.pagination;
  const statusOptions = tab === 'ACTIVE' ? ACTIVE_STATUSES : ARCHIVED_STATUSES;

  const switchTab = (next: Tab) => {
    setTab(next);
    setStatus('');
    setPage(1);
    setSelectedId(null);
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-md border border-gray-300 bg-white p-0.5">
            {(['ACTIVE', 'ARCHIVED'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                  tab === t ? 'bg-brand-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t === 'ACTIVE' ? 'Active' : 'Archived'}
              </button>
            ))}
          </div>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="w-52"
          >
            <option value="">{tab === 'ACTIVE' ? 'All active' : 'All archived'}</option>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading orders…</p>}
      {isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error instanceof ApiError ? error.message : 'Failed to load orders'}
        </p>
      )}

      {data && data.data.length === 0 && (
        <p className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          {tab === 'ACTIVE' ? 'No active orders.' : 'No archived orders yet.'}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          {data?.data.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              selected={selectedId === order.id}
              onSelect={() => setSelectedId(order.id)}
            />
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
              Select an order to view the card.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
