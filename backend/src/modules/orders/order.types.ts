import type { Prisma } from '@prisma/client';

export const orderInclude = {
  items: { orderBy: { createdAt: 'asc' as const } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  vendor: { select: { id: true, vendorName: true } },
  restaurant: { select: { id: true, restaurantName: true } },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export interface OrderItemDto {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  unit: string;
  unitPrice: string;
  quantity: string;
  subtotal: string;
}

export interface OrderStatusHistoryDto {
  id: string;
  oldStatus: string | null;
  newStatus: string;
  changedBy: string | null;
  remarks: string | null;
  createdAt: string;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  restaurantId: string;
  restaurantName: string | null;
  vendorId: string;
  vendorName: string | null;
  status: string;
  currency: string;
  subtotal: string;
  discountAmount: string;
  gstAmount: string;
  deliveryCharges: string;
  totalAmount: string;
  placedAt: string | null;
  acceptedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  items: OrderItemDto[];
  statusHistory: OrderStatusHistoryDto[];
  createdAt: string;
  updatedAt: string;
}
