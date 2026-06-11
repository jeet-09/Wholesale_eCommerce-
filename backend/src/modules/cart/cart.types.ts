import type { Prisma } from '@prisma/client';

/**
 * Cart graph including each line's product, its current price and inventory.
 * Rich enough to (a) render the cart and (b) let the order flow re-read current
 * price/stock inside its transaction (DATABASE.md Order Creation Flow step 3).
 */
export const cartInclude = {
  items: {
    where: { deletedAt: null },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          unit: true,
          status: true,
          vendorId: true,
          prices: { where: { isCurrent: true }, take: 1 },
          inventory: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.CartInclude;

export type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;
export type CartItemWithProduct = CartWithItems['items'][number];

export interface CartItemDto {
  id: string;
  productId: string;
  productName: string;
  unit: string;
  quantity: string;
  unitPriceSnapshot: string;
  currentPrice: string | null;
  subtotal: string;
  priceChanged: boolean;
}

export interface CartDto {
  id: string;
  restaurantId: string;
  status: string;
  items: CartItemDto[];
  itemCount: number;
  subtotal: string;
  createdAt: string;
  updatedAt: string;
}
