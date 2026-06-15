'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardBody, StatusBadge } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAddToCart } from '@/hooks/use-cart';
import { useProducts } from '@/hooks/use-products';
import { ApiError } from '@/lib/api';
import { useAuthz } from '@/lib/authz';
import { formatMoney, formatQuantity, titleCase } from '@/lib/format';
import type { Product } from '@/lib/types';

const PAGE_SIZE = 12;

function ProductCard({ product, canBuy }: { product: Product; canBuy: boolean }) {
  const addToCart = useAddToCart();
  const [quantity, setQuantity] = useState('1');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; message: string } | null>(null);

  const outOfStock = !product.supply.inStock;
  const price = product.sellingPrice;

  const onAdd = () => {
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setFeedback({ type: 'err', message: 'Enter a valid quantity' });
      return;
    }
    addToCart.mutate(
      { productId: product.id, quantity: qty },
      {
        onSuccess: () => setFeedback({ type: 'ok', message: 'Added to cart' }),
        onError: (err) =>
          setFeedback({
            type: 'err',
            message: err instanceof ApiError ? err.message : 'Failed to add',
          }),
      },
    );
  };

  return (
    <Card className="flex flex-col">
      <CardBody className="flex flex-1 flex-col">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-gray-900">{product.name}</h3>
            <p className="text-xs text-gray-500">{product.categoryName ?? 'Uncategorised'}</p>
          </div>
          <StatusBadge status={outOfStock ? 'OUT_OF_STOCK' : product.status} />
        </div>
        <p className="mb-3 line-clamp-2 text-sm text-gray-600">
          {product.description ?? 'No description provided.'}
        </p>
        <dl className="mb-3 grid grid-cols-2 gap-y-1 text-sm">
          <dt className="text-gray-500">Price</dt>
          <dd className="text-right font-medium text-gray-900">
            {price
              ? `${formatMoney(price.price, price.currency)} / ${titleCase(product.unit)}`
              : '—'}
          </dd>
          <dt className="text-gray-500">Available</dt>
          <dd className="text-right text-gray-700">
            {formatQuantity(product.supply.totalAvailableQuantity)} {titleCase(product.unit)}
          </dd>
          <dt className="text-gray-500">Suppliers</dt>
          <dd className="text-right text-gray-700">{product.supply.vendorCount}</dd>
          <dt className="text-gray-500">SKU</dt>
          <dd className="text-right text-gray-700">{product.sku}</dd>
        </dl>

        {canBuy && (
          <div className="mt-auto space-y-2">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="0.001"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-24"
                aria-label="Quantity"
              />
              <Button
                onClick={onAdd}
                disabled={addToCart.isPending || outOfStock || !price}
                className="flex-1"
              >
                {outOfStock ? 'Out of stock' : 'Add to cart'}
              </Button>
            </div>
            {feedback && (
              <p
                className={
                  feedback.type === 'ok' ? 'text-xs text-brand-700' : 'text-xs text-red-600'
                }
              >
                {feedback.message}
              </p>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function ProductsPage() {
  const authz = useAuthz();
  const canBuy = authz.isRestaurant;

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useProducts({
    page,
    pageSize: PAGE_SIZE,
    search: search || undefined,
    status: 'APPROVED',
    sort: '-createdAt',
  });

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  const pagination = data?.pagination;

  // The buying storefront is restaurant-only (project-working.md → Restaurant
  // Portal). Vendors manage Pricing & Inventory; staff manage the Catalog.
  if (!canBuy) {
    return (
      <Card>
        <CardBody className="py-12 text-center">
          <h1 className="text-xl font-semibold text-gray-900">Product storefront</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
            Browsing and ordering products is available to restaurant accounts. Vendors set their
            price and stock under <span className="font-medium">Pricing &amp; Inventory</span>;
            Admin and Administration manage the master catalog under{' '}
            <span className="font-medium">Catalog</span>.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-500">Browse the wholesale catalog</p>
        </div>
        <form onSubmit={onSearch} className="flex gap-2">
          <Input
            placeholder="Search products…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-64"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
      </div>

      {isLoading && <p className="text-sm text-gray-500">Loading products…</p>}
      {isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error instanceof ApiError ? error.message : 'Failed to load products'}
        </p>
      )}

      {data && data.data.length === 0 && (
        <p className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
          No products found.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.data.map((product) => (
          <ProductCard key={product.id} product={product} canBuy={canBuy} />
        ))}
      </div>

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
    </div>
  );
}
