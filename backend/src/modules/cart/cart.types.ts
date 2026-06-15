import type { Prisma } from '@prisma/client';

/**
 * Cart graph including each line's master product and its current selling
 * price. Rich enough to (a) render the cart and (b) let the order flow re-read
 * the CURRENT selling price inside its transaction. Stock is NOT checked here:
 * a vendor is only assigned after the order is placed (project-working.md).
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
          prices: { where: { isCurrent: true }, take: 1 },
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
