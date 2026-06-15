'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardBody, StatusBadge } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { useCategories } from '@/hooks/use-categories';
import { useProductOffers, useReviewOffer } from '@/hooks/use-offers';
import {
  useChangeProductStatus,
  useCreateProduct,
  useDeleteProduct,
  usePriceSuggestion,
  useProducts,
  useSetPrice,
  useUpdateProduct,
} from '@/hooks/use-products';
import { ApiError } from '@/lib/api';
import { PERMISSIONS, useAuthz } from '@/lib/authz';
import { formatMoney, formatQuantity, titleCase } from '@/lib/format';
import type { Category, Product } from '@/lib/types';

const UNITS = ['KG', 'GRAM', 'LITER', 'ML', 'PIECE', 'BOX', 'PACKET', 'DOZEN', 'BUNDLE'] as const;
const PRODUCT_STATUSES = ['DRAFT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'INACTIVE'] as const;
const PAGE_SIZE = 20;

type Feedback = { type: 'ok' | 'err'; message: string } | null;

function errMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong';
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-gray-200 p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}

function CreateProductForm({ categories, onClose }: { categories: Category[]; onClose: () => void }) {
  const create = useCreateProduct();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [form, setForm] = useState({
    name: '',
    sku: '',
    categoryId: categories[0]?.id ?? '',
    unit: 'KG' as string,
    brand: '',
    description: '',
    transportPercent: '20',
    isFeatured: false,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!form.name.trim() || !form.sku.trim() || !form.categoryId) {
      setFeedback({ type: 'err', message: 'Name, SKU and category are required.' });
      return;
    }
    create.mutate(
      {
        name: form.name.trim(),
        sku: form.sku.trim(),
        categoryId: form.categoryId,
        unit: form.unit,
        brand: form.brand.trim() || null,
        description: form.description.trim() || null,
        transportPercent: Number(form.transportPercent) || 0,
        isFeatured: form.isFeatured,
      },
      {
        onSuccess: () => onClose(),
        onError: (err) => setFeedback({ type: 'err', message: errMessage(err) }),
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-800">
        New products start as <strong>DRAFT</strong>. Vendors then submit price offers; the selling
        price is computed from the average offer plus transport markup once you approve it.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="np-name">Name</Label>
          <Input id="np-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Basmati Rice 25kg" />
        </div>
        <div>
          <Label htmlFor="np-sku">SKU</Label>
          <Input id="np-sku" value={form.sku} onChange={(e) => set('sku', e.target.value)} placeholder="Globally unique" />
        </div>
        <div>
          <Label htmlFor="np-category">Category</Label>
          <Select id="np-category" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
            <option value="" disabled>
              Select a category
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="np-unit">Unit</Label>
          <Select id="np-unit" value={form.unit} onChange={(e) => set('unit', e.target.value)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {titleCase(u)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="np-transport">Transport markup %</Label>
          <Input
            id="np-transport"
            type="number"
            min="0"
            step="0.01"
            value={form.transportPercent}
            onChange={(e) => set('transportPercent', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="np-brand">Brand (optional)</Label>
          <Input id="np-brand" value={form.brand} onChange={(e) => set('brand', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="np-desc">Description (optional)</Label>
          <textarea
            id="np-desc"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={form.isFeatured}
            onChange={(e) => set('isFeatured', e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600"
          />
          Feature this product
        </label>
      </div>

      <FeedbackLine feedback={feedback} />

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Creating…' : 'Create product'}
        </Button>
      </div>
    </form>
  );
}

function PriceSection({ product }: { product: Product }) {
  const { data: suggestion } = usePriceSuggestion(product.id);
  const setPrice = useSetPrice();
  const [override, setOverride] = useState('');
  const [feedback, setFeedback] = useState<Feedback>(null);
  const currency = product.sellingPrice?.currency ?? suggestion?.currency ?? 'INR';

  const applyComputed = () => {
    setFeedback(null);
    setPrice.mutate(
      { id: product.id, currency },
      {
        onSuccess: () => setFeedback({ type: 'ok', message: 'Selling price set from vendor average.' }),
        onError: (err) => setFeedback({ type: 'err', message: errMessage(err) }),
      },
    );
  };

  const applyOverride = () => {
    setFeedback(null);
    const value = Number(override);
    if (!Number.isFinite(value) || value <= 0) {
      setFeedback({ type: 'err', message: 'Enter a valid override price.' });
      return;
    }
    setPrice.mutate(
      { id: product.id, price: value, currency },
      {
        onSuccess: () => {
          setFeedback({ type: 'ok', message: 'Override price applied.' });
          setOverride('');
        },
        onError: (err) => setFeedback({ type: 'err', message: errMessage(err) }),
      },
    );
  };

  return (
    <Section title="Selling price">
      <dl className="mb-3 grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-gray-500">Current price</dt>
        <dd className="text-right font-medium text-gray-900">
          {product.sellingPrice ? formatMoney(product.sellingPrice.price, product.sellingPrice.currency) : '—'}
        </dd>
        <dt className="text-gray-500">Vendor offers</dt>
        <dd className="text-right text-gray-700">{suggestion?.vendorCount ?? product.supply.vendorCount}</dd>
        <dt className="text-gray-500">Average vendor price</dt>
        <dd className="text-right text-gray-700">{formatMoney(suggestion?.averageVendorPrice ?? product.supply.averageVendorPrice)}</dd>
        <dt className="text-gray-500">Transport markup</dt>
        <dd className="text-right text-gray-700">{suggestion?.transportPercent ?? product.transportPercent}%</dd>
        <dt className="text-gray-500">Computed price</dt>
        <dd className="text-right font-medium text-brand-700">{formatMoney(suggestion?.computedPrice ?? product.supply.computedPrice)}</dd>
      </dl>
      <div className="flex flex-wrap items-end gap-2">
        <Button size="sm" onClick={applyComputed} disabled={setPrice.isPending || !(suggestion?.computedPrice ?? product.supply.computedPrice)}>
          Use computed price
        </Button>
        <div>
          <Label htmlFor="price-override">Override</Label>
          <Input
            id="price-override"
            type="number"
            min="0"
            step="0.01"
            value={override}
            onChange={(e) => setOverride(e.target.value)}
            placeholder="manual price"
            className="w-32"
          />
        </div>
        <Button size="sm" variant="secondary" onClick={applyOverride} disabled={setPrice.isPending}>
          Apply override
        </Button>
      </div>
      <div className="mt-2">
        <FeedbackLine feedback={feedback} />
      </div>
    </Section>
  );
}

function OffersSection({ product, canReview }: { product: Product; canReview: boolean }) {
  const { data } = useProductOffers(product.id);
  const review = useReviewOffer();
  const offers = data?.data ?? [];

  if (offers.length === 0) {
    return (
      <Section title="Vendor offers">
        <p className="text-sm text-gray-400">No vendor offers yet.</p>
      </Section>
    );
  }

  return (
    <Section title={`Vendor offers (${offers.length})`}>
      <ul className="space-y-2">
        {offers.map((offer) => (
          <li key={offer.id} className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2 text-sm">
            <div>
              <p className="font-medium text-gray-900">{offer.vendorName ?? 'Vendor'}</p>
              <p className="text-xs text-gray-500">
                {formatMoney(offer.vendorPrice, offer.currency)} · {formatQuantity(offer.sellableQuantity)} avail.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={offer.status} />
              {canReview && offer.status === 'PENDING' && (
                <>
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
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function EditProductPanel({ product, categories, onClose }: { product: Product; categories: Category[]; onClose: () => void }) {
  const authz = useAuthz();
  const canEdit = authz.can(PERMISSIONS.PRODUCT_UPDATE);
  const canReview = authz.can(PERMISSIONS.PRODUCT_REVIEW);
  const canPrice = authz.can(PERMISSIONS.PRICE_UPDATE);
  const canDelete = authz.can(PERMISSIONS.PRODUCT_DELETE);

  const updateProduct = useUpdateProduct();
  const changeStatus = useChangeProductStatus();
  const deleteProduct = useDeleteProduct();

  const [details, setDetails] = useState({
    name: product.name,
    categoryId: product.categoryId,
    unit: product.unit,
    brand: product.brand ?? '',
    description: product.description ?? '',
    transportPercent: product.transportPercent,
    isFeatured: product.isFeatured,
  });
  const [detailsFb, setDetailsFb] = useState<Feedback>(null);
  const [status, setStatus] = useState(product.status);
  const [statusFb, setStatusFb] = useState<Feedback>(null);

  const saveDetails = () => {
    setDetailsFb(null);
    if (!details.name.trim() || !details.categoryId) {
      setDetailsFb({ type: 'err', message: 'Name and category are required.' });
      return;
    }
    updateProduct.mutate(
      {
        id: product.id,
        body: {
          name: details.name.trim(),
          categoryId: details.categoryId,
          unit: details.unit,
          brand: details.brand.trim() || null,
          description: details.description.trim() || null,
          transportPercent: Number(details.transportPercent) || 0,
          isFeatured: details.isFeatured,
        },
      },
      {
        onSuccess: () => setDetailsFb({ type: 'ok', message: 'Details saved.' }),
        onError: (err) => setDetailsFb({ type: 'err', message: errMessage(err) }),
      },
    );
  };

  const saveStatus = () => {
    setStatusFb(null);
    changeStatus.mutate(
      { id: product.id, status },
      {
        onSuccess: () => setStatusFb({ type: 'ok', message: 'Status updated.' }),
        onError: (err) => setStatusFb({ type: 'err', message: errMessage(err) }),
      },
    );
  };

  const onDelete = () => {
    if (!window.confirm(`Delete "${product.name}"? This removes it from the catalog.`)) return;
    deleteProduct.mutate(product.id, { onSuccess: () => onClose() });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        SKU <span className="font-medium text-gray-700">{product.sku}</span> · {titleCase(product.unit)} ·{' '}
        <StatusBadge status={product.status} />
      </p>

      {canEdit && (
        <Section title="Details">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="ed-name">Name</Label>
              <Input id="ed-name" value={details.name} onChange={(e) => setDetails((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="ed-category">Category</Label>
              <Select id="ed-category" value={details.categoryId} onChange={(e) => setDetails((p) => ({ ...p, categoryId: e.target.value }))}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="ed-unit">Unit</Label>
              <Select id="ed-unit" value={details.unit} onChange={(e) => setDetails((p) => ({ ...p, unit: e.target.value }))}>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {titleCase(u)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="ed-transport">Transport markup %</Label>
              <Input
                id="ed-transport"
                type="number"
                min="0"
                step="0.01"
                value={details.transportPercent}
                onChange={(e) => setDetails((p) => ({ ...p, transportPercent: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="ed-brand">Brand</Label>
              <Input id="ed-brand" value={details.brand} onChange={(e) => setDetails((p) => ({ ...p, brand: e.target.value }))} />
            </div>
            <label className="mt-6 flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={details.isFeatured}
                onChange={(e) => setDetails((p) => ({ ...p, isFeatured: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600"
              />
              Featured
            </label>
            <div className="sm:col-span-2">
              <Label htmlFor="ed-desc">Description</Label>
              <textarea
                id="ed-desc"
                value={details.description}
                onChange={(e) => setDetails((p) => ({ ...p, description: e.target.value }))}
                rows={3}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <FeedbackLine feedback={detailsFb} />
            <Button size="sm" onClick={saveDetails} disabled={updateProduct.isPending}>
              {updateProduct.isPending ? 'Saving…' : 'Save details'}
            </Button>
          </div>
        </Section>
      )}

      {canReview && (
        <Section title="Lifecycle status">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor="ed-status">Status</Label>
              <Select id="ed-status" value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
                {PRODUCT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.replace(/_/g, ' ')}
                  </option>
                ))}
              </Select>
            </div>
            <Button size="sm" onClick={saveStatus} disabled={changeStatus.isPending}>
              {changeStatus.isPending ? 'Saving…' : 'Update status'}
            </Button>
          </div>
          <div className="mt-2">
            <FeedbackLine feedback={statusFb} />
          </div>
        </Section>
      )}

      {canPrice && <PriceSection product={product} />}

      <OffersSection product={product} canReview={authz.can(PERMISSIONS.OFFER_REVIEW)} />

      <div className="flex items-center justify-between border-t border-gray-200 pt-4">
        {canDelete ? (
          <Button variant="danger" size="sm" onClick={onDelete} disabled={deleteProduct.isPending}>
            {deleteProduct.isPending ? 'Deleting…' : 'Delete product'}
          </Button>
        ) : (
          <span />
        )}
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

export default function ManageProductsPage() {
  const authz = useAuthz();
  const canCreate = authz.can(PERMISSIONS.PRODUCT_CREATE);
  const canManage = canCreate || authz.can(PERMISSIONS.PRODUCT_REVIEW);

  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const categoriesQuery = useCategories();
  const categories = useMemo(() => categoriesQuery.data?.data ?? [], [categoriesQuery.data]);

  const { data, isLoading, isError, error } = useProducts({
    page,
    pageSize: PAGE_SIZE,
    status: statusFilter || undefined,
    sort: '-createdAt',
  });

  if (!canManage) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
        The catalog is managed by the Admin and Administration teams. Vendors submit price offers
        from the <span className="font-medium">Offers</span> page.
      </div>
    );
  }

  const products = data?.data ?? [];
  const pagination = data?.pagination;
  const editing = products.find((p) => p.id === editingId) ?? null;
  const noCategories = !categoriesQuery.isLoading && categories.length === 0;

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Master catalog</h1>
          <p className="text-sm text-gray-500">Create products, approve them, and set selling prices</p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="w-44"
          >
            <option value="">All statuses</option>
            {PRODUCT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
          {canCreate && (
            <Button onClick={() => setCreating(true)} disabled={noCategories}>
              New product
            </Button>
          )}
        </div>
      </div>

      {noCategories && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No categories exist yet. Create at least one category before adding products.
        </p>
      )}

      {isLoading && <p className="text-sm text-gray-500">Loading catalog…</p>}
      {isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error instanceof ApiError ? error.message : 'Failed to load products'}
        </p>
      )}

      {data && products.length === 0 && (
        <p className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          No products found.
        </p>
      )}

      {products.length > 0 && (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Selling price</th>
                  <th className="px-4 py-3 font-medium">Suppliers</th>
                  <th className="px-4 py-3 font-medium">Available</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {products.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{product.name}</div>
                      <div className="text-xs text-gray-500">{product.sku}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{product.categoryName ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={product.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {product.sellingPrice ? formatMoney(product.sellingPrice.price, product.sellingPrice.currency) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{product.supply.vendorCount}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatQuantity(product.supply.totalAvailableQuantity)} {titleCase(product.unit)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="secondary" size="sm" onClick={() => setEditingId(product.id)}>
                        Manage
                      </Button>
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
        <Modal title="New product" onClose={() => setCreating(false)}>
          <CreateProductForm categories={categories} onClose={() => setCreating(false)} />
        </Modal>
      )}

      {editing && (
        <Modal title={`Manage · ${editing.name}`} onClose={() => setEditingId(null)}>
          <EditProductPanel product={editing} categories={categories} onClose={() => setEditingId(null)} />
        </Modal>
      )}
    </div>
  );
}
