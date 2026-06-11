import { Prisma } from '@prisma/client';

import { toMoneyString, toQuantityString } from '../../utils/decimal';
import type { CartDto, CartItemDto, CartItemWithProduct, CartWithItems } from './cart.types';

export function toCartItemDto(item: CartItemWithProduct): CartItemDto {
  const current = item.product.prices[0] ?? null;
  const priceChanged = current ? !current.price.equals(item.unitPriceSnapshot) : false;
  return {
    id: item.id,
    productId: item.productId,
    productName: item.product.name,
    unit: item.product.unit,
    quantity: toQuantityString(item.quantity),
    unitPriceSnapshot: toMoneyString(item.unitPriceSnapshot),
    currentPrice: current ? toMoneyString(current.price) : null,
    subtotal: toMoneyString(item.subtotal),
    priceChanged,
  };
}

export function toCartDto(cart: CartWithItems): CartDto {
  const items = cart.items.map(toCartItemDto);
  const subtotal = cart.items.reduce(
    (acc, item) => acc.plus(item.subtotal),
    new Prisma.Decimal(0),
  );
  return {
    id: cart.id,
    restaurantId: cart.restaurantId,
    status: cart.status,
    items,
    itemCount: items.length,
    subtotal: toMoneyString(subtotal),
    createdAt: cart.createdAt.toISOString(),
    updatedAt: cart.updatedAt.toISOString(),
  };
}
