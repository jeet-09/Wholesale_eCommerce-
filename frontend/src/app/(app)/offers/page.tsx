'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardBody, StatusBadge } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { useOffers, useReviewOffer, useSubmitOffer, useUpdateOffer } from '@/hooks/use-offers';
import { useProducts } from '@/hooks/use-products';
import { ApiError } from '@/lib/api';
import { PERMISSIONS, useAuthz } from '@/lib/authz';
import { formatMoney, formatQuantity, titleCase } from '@/lib/format';
import type { Offer } from '@/lib/types';

const PAGE_SIZE = 20;

type Feedback = { type: 'ok' | 'err'; message: string } | null;

function errMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong';
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
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

function SubmitOfferForm({ onClose }: { onClose: () => void }) {
  const submit = useSubmitOffer();
  const { data: productsData } = useProducts({ status: 'APPROVED', pageSize: 100, sort: 'name' });
  const products = useMemo(() => productsData?.data ?? [], [productsData]);

  const [productId, setProductId] = useState('');
  const [vendorPrice, setVendorPrice] = useState('');
  const [availableQuantity, setAvailableQuantity] = useState('0');
  const [feedback, setFeedback] = useState<Feedback>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const price = Number(vendorPrice);
    const qty = Number(availableQuantity);
    if (!productId) {
      setFeedback({ type: 'err', message: 'Select a product.' });
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setFeedback({ type: 'err', message: 'Enter a valid price.' });
      return;
    }
    submit.mutate(
      { productId, vendorPrice: price, availableQuantity: Number.isFinite(qty) ? qty : 0 },
      {
        onSuccess: () => onClose(),
        onError: (err) => setFeedback({ type: 'err', message: errMessage(err) }),
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
        Submitting an offer for a product you already supply updates your existing price and stock.
      </p>
      <div>
        <Label htmlFor="of-product">Product</Label>
        <Select id="of-product" value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">Select an approved product…</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.sku})
            </option>
          ))}
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="of-price">Your price</Label>
          <Input id="of-price" type="number" min="0" step="0.01" value={vendorPrice} onChange={(e) => setVendorPrice(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="of-qty">Available qty (inventory)</Label>
          <Input id="of-qty" type="number" min="0" step="0.001" value={availableQuantity} onChange={(e) => setAvailableQuantity(e.target.value)} />
        </div>
      </div>
      <FeedbackLine feedback={feedback} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={submit.isPending}>
          {submit.isPending ? 'Submitting…' : 'Submit offer'}
        </Button>
      </div>
    </form>
  );
}

function FeedbackLine({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p className={feedback.type === 'ok' ? 'text-sm text-brand-700' : 'text-sm text-red-600'}>{feedback.message}</p>
  );
}

function EditOfferForm({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const update = useUpdateOffer();
  const [vendorPrice, setVendorPrice] = useState(offer.vendorPrice);
  const [availableQuantity, setAvailableQuantity] = useState(offer.availableQuantity);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    update.mutate(
      { id: offer.id, vendorPrice: Number(vendorPrice), availableQuantity: Number(availableQuantity) },
      {
        onSuccess: () => onClose(),
        onError: (err) => setFeedback({ type: 'err', message: errMessage(err) }),
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="text-sm text-gray-600">
        {offer.productName} <span className="text-gray-400">({offer.productSku})</span>
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="eo-price">Your price</Label>
          <Input id="eo-price" type="number" min="0" step="0.01" value={vendorPrice} onChange={(e) => setVendorPrice(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="eo-qty">Available qty (inventory)</Label>
          <Input id="eo-qty" type="number" min="0" step="0.001" value={availableQuantity} onChange={(e) => setAvailableQuantity(e.target.value)} />
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Reserved: {formatQuantity(offer.reservedQuantity)} · Sellable: {formatQuantity(offer.sellableQuantity)}
      </p>
      <FeedbackLine feedback={feedback} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save offer'}
        </Button>
      </div>
    </form>
  );
}

export default function OffersPage() {
  const authz = useAuthz();
  const canReview = authz.can(PERMISSIONS.OFFER_REVIEW);
  const canSubmit = authz.can(PERMISSIONS.OFFER_CREATE);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState(canReview && !authz.isVendor ? 'PENDING' : '');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Offer | null>(null);

  const review = useReviewOffer();
  const { data, isLoading, isError, error } = useOffers({
    page,
    pageSize: PAGE_SIZE,
    status: statusFilter || undefined,
    sort: '-createdAt',
  });

  const offers = data?.data ?? [];
  const pagination = data?.pagination;
  const reviewMode = canReview && !authz.isVendor;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {reviewMode ? 'Offer review' : 'Pricing & Inventory'}
          </h1>
          <p className="text-sm text-gray-500">
            {reviewMode
              ? 'Approve or reject vendor price + stock submissions'
              : 'Select an approved product, set your price and available quantity (inventory)'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-40"
          >
            <option value="">All statuses</option>
            {['PENDING', 'APPROVED', 'REJECTED', 'INACTIVE'].map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </Select>
          {canSubmit && <Button onClick={() => setCreating(true)}>Add product price</Button>}
        </div>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading offers…</p>}
      {isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error instanceof ApiError ? error.message : 'Failed to load offers'}
        </p>
      )}

      {data && offers.length === 0 && (
        <p className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          No offers found.
        </p>
      )}

      {offers.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  {reviewMode && <th className="px-4 py-3 font-medium">Vendor</th>}
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Available</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {offers.map((offer) => (
                  <tr key={offer.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{offer.productName ?? '—'}</div>
                      <div className="text-xs text-gray-500">{offer.productSku}</div>
                    </td>
                    {reviewMode && <td className="px-4 py-3 text-gray-700">{offer.vendorName ?? '—'}</td>}
                    <td className="px-4 py-3 text-gray-700">{formatMoney(offer.vendorPrice, offer.currency)}</td>
                    <td className="px-4 py-3 text-gray-700">{formatQuantity(offer.sellableQuantity)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={offer.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {reviewMode ? (
                        offer.status === 'PENDING' && (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => review.mutate({ id: offer.id, status: 'APPROVED' })} disabled={review.isPending}>
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              onClick={() => review.mutate({ id: offer.id, status: 'REJECTED' })}
                              disabled={review.isPending}
                            >
                              Reject
                            </Button>
                          </div>
                        )
                      ) : (
                        <Button variant="secondary" size="sm" onClick={() => setEditing(offer)}>
                          Edit
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <Button variant="secondary" size="sm" disabled={!pagination.hasPreviousPage} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <span className="text-sm text-gray-600">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <Button variant="secondary" size="sm" disabled={!pagination.hasNextPage} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      )}

      {creating && (
        <Modal title="Add product price & inventory" onClose={() => setCreating(false)}>
          <SubmitOfferForm onClose={() => setCreating(false)} />
        </Modal>
      )}

      {editing && (
        <Modal title="Edit offer" onClose={() => setEditing(null)}>
          <EditOfferForm offer={editing} onClose={() => setEditing(null)} />
        </Modal>
      )}
    </div>
  );
}
