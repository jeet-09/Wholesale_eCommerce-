'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useCart, useRemoveCartItem, useUpdateCartItem } from '@/hooks/use-cart';
import { usePlaceOrder } from '@/hooks/use-orders';
import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/lib/auth-store';
import { formatMoney, formatQuantity, titleCase } from '@/lib/format';
import type { CartItem } from '@/lib/types';

function CartItemRow({ item }: { item: CartItem }) {
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();
  const [quantity, setQuantity] = useState(item.quantity);

  const onUpdate = () => {
    const qty = Number(quantity);
    if (Number.isFinite(qty) && qty > 0) {
      updateItem.mutate({ itemId: item.id, quantity: qty });
    }
  };

  return (
    <tr className="border-b border-gray-100">
      <td className="py-3">
        <p className="font-medium text-gray-900">{item.productName}</p>
        <p className="text-xs text-gray-500">{titleCase(item.unit)}</p>
        {item.priceChanged && (
          <p className="text-xs text-amber-600">
            Price changed: now {formatMoney(item.currentPrice)} (was {formatMoney(item.unitPriceSnapshot)})
          </p>
        )}
      </td>
      <td className="py-3 text-right text-gray-700">{formatMoney(item.unitPriceSnapshot)}</td>
      <td className="py-3">
        <div className="flex items-center justify-end gap-2">
          <Input
            type="number"
            min="0"
            step="0.001"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onBlur={onUpdate}
            className="w-24"
            aria-label={`Quantity for ${item.productName}`}
          />
        </div>
      </td>
      <td className="py-3 text-right font-medium text-gray-900">{formatMoney(item.subtotal)}</td>
      <td className="py-3 text-right">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => removeItem.mutate(item.id)}
          disabled={removeItem.isPending}
        >
          Remove
        </Button>
      </td>
    </tr>
  );
}

export default function CartPage() {
  const router = useRouter();
  const context = useAuthStore((s) => s.context);
  const isRestaurant = Boolean(context?.restaurantId);
  const { data: cart, isLoading, isError, error } = useCart(isRestaurant);
  const placeOrder = usePlaceOrder();
  const [placeError, setPlaceError] = useState<string | null>(null);

  if (!isRestaurant) {
    return (
      <p className="rounded-md border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-sm text-gray-500">
        Only restaurant accounts have a cart.
      </p>
    );
  }

  const onCheckout = () => {
    setPlaceError(null);
    placeOrder.mutate(
      {},
      {
        onSuccess: () => router.push('/orders'),
        onError: (err) =>
          setPlaceError(err instanceof ApiError ? err.message : 'Failed to place order'),
      },
    );
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Your cart</h1>

      {isLoading && <p className="text-sm text-gray-500">Loading cart…</p>}
      {isError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {error instanceof ApiError ? error.message : 'Failed to load cart'}
        </p>
      )}

      {cart && cart.items.length === 0 && (
        <Card>
          <CardBody className="py-10 text-center text-sm text-gray-500">
            Your cart is empty. Browse the{' '}
            <a href="/products" className="font-medium text-brand-700 hover:underline">
              products
            </a>{' '}
            to add items.
          </CardBody>
        </Card>
      )}

      {cart && cart.items.length > 0 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardBody>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
                    <th className="py-2">Item</th>
                    <th className="py-2 text-right">Unit price</th>
                    <th className="py-2 text-right">Qty</th>
                    <th className="py-2 text-right">Subtotal</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {cart.items.map((item) => (
                    <CartItemRow key={item.id} item={item} />
                  ))}
                </tbody>
              </table>
            </CardBody>
          </Card>

          <Card className="h-fit">
            <CardBody>
              <h2 className="mb-4 text-lg font-semibold text-gray-900">Summary</h2>
              <div className="flex justify-between border-b border-gray-100 py-2 text-sm">
                <span className="text-gray-500">Items</span>
                <span className="text-gray-900">{cart.itemCount}</span>
              </div>
              <div className="flex justify-between py-2 text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="font-medium text-gray-900">{formatMoney(cart.subtotal)}</span>
              </div>
              <p className="mb-4 mt-2 text-xs text-gray-400">
                Taxes and delivery are calculated per vendor when the order is placed. Items from
                multiple vendors create separate orders.
              </p>
              {placeError && (
                <p className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{placeError}</p>
              )}
              <Button className="w-full" onClick={onCheckout} disabled={placeOrder.isPending}>
                {placeOrder.isPending ? 'Placing order…' : 'Place order'}
              </Button>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}
