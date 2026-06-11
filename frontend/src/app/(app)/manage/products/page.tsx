'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardBody, StatusBadge } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { useCategories } from '@/hooks/use-categories';
import {
  useAdjustInventory,
  useChangePrice,
  useCreateProduct,
  useDeleteProduct,
  useProducts,
  useUpdateProduct,
} from '@/hooks/use-products';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { formatMoney, formatQuantity, titleCase } from '@/lib/format';
import type { Category, Product } from '@/lib/types';

const UNITS = ['KG', 'GRAM', 'LITER', 'ML', 'PIECE', 'BOX', 'PACKET'] as const;
const STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE', 'OUT_OF_STOCK', 'ARCHIVED'] as const;
const PAGE_SIZE = 20;

type Feedback = { type: 'ok' | 'err'; message: string } | null;

function errMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong';
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
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

function CreateProductForm({
  categories,
  onClose,
}: {
  categories: Category[];
  onClose: () => void;
}) {
  const create = useCreateProduct();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [form, setForm] = useState({
    name: '',
    sku: '',
    categoryId: categories[0]?.id ?? '',
    unit: 'KG' as string,
    status: 'ACTIVE' as string,
    brand: '',
    description: '',
    price: '',
    currency: 'INR',
    initialStock: '0',
    minimumStock: '0',
    isFeatured: false,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const price = Number(form.price);
    if (!form.name.trim() || !form.sku.trim() || !form.categoryId) {
      setFeedback({ type: 'err', message: 'Name, SKU and category are required.' });
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setFeedback({ type: 'err', message: 'Enter a valid price greater than 0.' });
      return;
    }
    create.mutate(
      {
        name: form.name.trim(),
        sku: form.sku.trim(),
        categoryId: form.categoryId,
        unit: form.unit,
        status: form.status,
        brand: form.brand.trim() || null,
        description: form.description.trim() || null,
        price,
        currency: form.currency.trim().toUpperCase() || 'INR',
        initialStock: Number(form.initialStock) || 0,
        minimumStock: Number(form.minimumStock) || 0,
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label htmlFor="np-name">Name</Label>
          <Input
            id="np-name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Basmati Rice 25kg"
          />
        </div>
        <div>
          <Label htmlFor="np-sku">SKU</Label>
          <Input
            id="np-sku"
            value={form.sku}
            onChange={(e) => set('sku', e.target.value)}
            placeholder="Unique per vendor"
          />
        </div>
        <div>
          <Label htmlFor="np-category">Category</Label>
          <Select
            id="np-category"
            value={form.categoryId}
            onChange={(e) => set('categoryId', e.target.value)}
          >
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
          <Label htmlFor="np-status">Status</Label>
          <Select id="np-status" value={form.status} onChange={(e) => set('status', e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="np-price">Price</Label>
          <Input
            id="np-price"
            type="number"
            min="0"
            step="0.01"
            value={form.price}
            onChange={(e) => set('price', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="np-currency">Currency</Label>
          <Input
            id="np-currency"
            value={form.currency}
            onChange={(e) => set('currency', e.target.value)}
            maxLength={3}
          />
        </div>
        <div>
          <Label htmlFor="np-stock">Initial stock</Label>
          <Input
            id="np-stock"
            type="number"
            min="0"
            step="0.001"
            value={form.initialStock}
            onChange={(e) => set('initialStock', e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="np-min">Minimum stock</Label>
          <Input
            id="np-min"
            type="number"
            min="0"
            step="0.001"
            value={form.minimumStock}
            onChange={(e) => set('minimumStock', e.target.value)}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-gray-200 p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </div>
  );
}

function EditProductPanel({
  product,
  categories,
  onClose,
}: {
  product: Product;
  categories: Category[];
  onClose: () => void;
}) {
  const updateProduct = useUpdateProduct();
  const changePrice = useChangePrice();
  const adjustStock = useAdjustInventory();
  const deleteProduct = useDeleteProduct();

  const [details, setDetails] = useState({
    name: product.name,
    categoryId: product.categoryId,
    status: product.status,
    brand: product.brand ?? '',
    description: product.description ?? '',
    isFeatured: product.isFeatured,
  });
  const [detailsFb, setDetailsFb] = useState<Feedback>(null);

  const [price, setPrice] = useState(product.currentPrice?.price ?? '');
  const [currency, setCurrency] = useState(product.currentPrice?.currency ?? 'INR');
  const [priceFb, setPriceFb] = useState<Feedback>(null);

  const [available, setAvailable] = useState(product.inventory?.availableQuantity ?? '0');
  const [minimum, setMinimum] = useState('');
  const [stockFb, setStockFb] = useState<Feedback>(null);

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
          status: details.status,
          brand: details.brand.trim() || null,
          description: details.description.trim() || null,
          isFeatured: details.isFeatured,
        },
      },
      {
        onSuccess: () => setDetailsFb({ type: 'ok', message: 'Details saved.' }),
        onError: (err) => setDetailsFb({ type: 'err', message: errMessage(err) }),
      },
    );
  };

  const savePrice = () => {
    setPriceFb(null);
    const value = Number(price);
    if (!Number.isFinite(value) || value <= 0) {
      setPriceFb({ type: 'err', message: 'Enter a valid price greater than 0.' });
      return;
    }
    changePrice.mutate(
      { id: product.id, price: value, currency: currency.trim().toUpperCase() || 'INR' },
      {
        onSuccess: () => setPriceFb({ type: 'ok', message: 'Price updated.' }),
        onError: (err) => setPriceFb({ type: 'err', message: errMessage(err) }),
      },
    );
  };

  const saveStock = () => {
    setStockFb(null);
    const avail = available === '' ? undefined : Number(available);
    const min = minimum === '' ? undefined : Number(minimum);
    if (avail === undefined && min === undefined) {
      setStockFb({ type: 'err', message: 'Enter a quantity to update.' });
      return;
    }
    if (
      (avail !== undefined && (!Number.isFinite(avail) || avail < 0)) ||
      (min !== undefined && (!Number.isFinite(min) || min < 0))
    ) {
      setStockFb({ type: 'err', message: 'Quantities must be 0 or greater.' });
      return;
    }
    adjustStock.mutate(
      { id: product.id, availableQuantity: avail, minimumQuantity: min },
      {
        onSuccess: () => {
          setStockFb({ type: 'ok', message: 'Stock updated.' });
          setMinimum('');
        },
        onError: (err) => setStockFb({ type: 'err', message: errMessage(err) }),
      },
    );
  };

  const onDelete = () => {
    if (!window.confirm(`Delete "${product.name}"? This removes it from the catalog.`)) return;
    deleteProduct.mutate(product.id, {
      onSuccess: () => onClose(),
    });
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        SKU <span className="font-medium text-gray-700">{product.sku}</span> ·{' '}
        {titleCase(product.unit)}
      </p>

      <Section title="Details">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="ed-name">Name</Label>
            <Input
              id="ed-name"
              value={details.name}
              onChange={(e) => setDetails((p) => ({ ...p, name: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="ed-category">Category</Label>
            <Select
              id="ed-category"
              value={details.categoryId}
              onChange={(e) => setDetails((p) => ({ ...p, categoryId: e.target.value }))}
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ed-status">Status</Label>
            <Select
              id="ed-status"
              value={details.status}
              onChange={(e) => setDetails((p) => ({ ...p, status: e.target.value }))}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="ed-brand">Brand</Label>
            <Input
              id="ed-brand"
              value={details.brand}
              onChange={(e) => setDetails((p) => ({ ...p, brand: e.target.value }))}
            />
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

      <Section title="Price">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="ed-price">Price</Label>
            <Input
              id="ed-price"
              type="number"
              min="0"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="ed-currency">Currency</Label>
            <Input
              id="ed-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              maxLength={3}
              className="w-24"
            />
          </div>
          <Button size="sm" onClick={savePrice} disabled={changePrice.isPending}>
            {changePrice.isPending ? 'Saving…' : 'Update price'}
          </Button>
        </div>
        <div className="mt-2">
          <FeedbackLine feedback={priceFb} />
        </div>
      </Section>

      <Section title="Stock">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="ed-available">Available</Label>
            <Input
              id="ed-available"
              type="number"
              min="0"
              step="0.001"
              value={available}
              onChange={(e) => setAvailable(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor="ed-min">Minimum (optional)</Label>
            <Input
              id="ed-min"
              type="number"
              min="0"
              step="0.001"
              value={minimum}
              onChange={(e) => setMinimum(e.target.value)}
              placeholder="unchanged"
              className="w-40"
            />
          </div>
          <Button size="sm" onClick={saveStock} disabled={adjustStock.isPending}>
            {adjustStock.isPending ? 'Saving…' : 'Update stock'}
          </Button>
        </div>
        <div className="mt-2">
          <FeedbackLine feedback={stockFb} />
        </div>
      </Section>

      <div className="flex items-center justify-between border-t border-gray-200 pt-4">
        <Button variant="danger" size="sm" onClick={onDelete} disabled={deleteProduct.isPending}>
          {deleteProduct.isPending ? 'Deleting…' : 'Delete product'}
        </Button>
        <Button variant="secondary" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

export default function ManageProductsPage() {
  const context = useAuthStore((s) => s.context);
  const isVendor = Boolean(context?.vendorId);

  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const categoriesQuery = useCategories();
  const categories = useMemo(() => categoriesQuery.data?.data ?? [], [categoriesQuery.data]);

  const { data, isLoading, isError, error } = useProducts({
    page,
    pageSize: PAGE_SIZE,
    sort: '-createdAt',
  });

  if (!isVendor) {
    return (
      <div className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
        Product management is available to vendor accounts. Sign in to the Vendor portal
        (default <span className="font-medium">localhost:3002</span>) to manage your catalog.
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
          <h1 className="text-2xl font-bold text-gray-900">Manage products</h1>
          <p className="text-sm text-gray-500">Add and update items in your catalog</p>
        </div>
        <Button onClick={() => setCreating(true)} disabled={noCategories}>
          New product
        </Button>
      </div>

      {noCategories && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No categories exist yet. An admin needs to create at least one category before you can add
          products.
        </p>
      )}

      {isLoading && <p className="text-sm text-gray-500">Loading your catalog…</p>}
      {isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error instanceof ApiError ? error.message : 'Failed to load products'}
        </p>
      )}

      {data && products.length === 0 && (
        <p className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          You have no products yet. Click “New product” to add your first item.
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
                  <th className="px-4 py-3 font-medium">Price</th>
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
                      {product.currentPrice
                        ? formatMoney(product.currentPrice.price, product.currentPrice.currency)
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700">
                      {formatQuantity(product.inventory?.availableQuantity ?? null)}{' '}
                      {titleCase(product.unit)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="secondary" size="sm" onClick={() => setEditingId(product.id)}>
                        Edit
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
        <Modal title="New product" onClose={() => setCreating(false)}>
          <CreateProductForm categories={categories} onClose={() => setCreating(false)} />
        </Modal>
      )}

      {editing && (
        <Modal title={`Edit · ${editing.name}`} onClose={() => setEditingId(null)}>
          <EditProductPanel
            product={editing}
            categories={categories}
            onClose={() => setEditingId(null)}
          />
        </Modal>
      )}
    </div>
  );
}
