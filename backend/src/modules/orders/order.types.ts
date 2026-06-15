import type { Prisma } from '@prisma/client';

export const orderInclude = {
  items: { orderBy: { createdAt: 'asc' as const } },
  statusHistory: { orderBy: { createdAt: 'asc' as const } },
  payments: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' as const } },
  assignedVendor: { select: { id: true, vendorName: true } },
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

export interface OrderPaymentDto {
  id: string;
  paymentType: string;
  amount: string;
  currency: string;
  status: string;
  proofUrl: string | null;
  transactionReference: string | null;
  remarks: string | null;
  verifiedAt: string | null;
  createdAt: string;
}

export interface OrderDto {
  id: string;
  orderNumber: string;
  restaurantId: string;
  restaurantName: string | null;
  assignedVendorId: string | null;
  assignedVendorName: string | null;
  status: string;
  currency: string;
  subtotal: string;
  discountAmount: string;
  gstAmount: string;
  deliveryCharges: string;
  totalAmount: string;
  advancePercent: string;
  advanceAmount: string;
  remainingAmount: string;
  placedAt: string | null;
  paymentSubmittedAt: string | null;
  paymentVerifiedAt: string | null;
  reviewedAt: string | null;
  assignedAt: string | null;
  acceptedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  rejectedAt: string | null;
  cancelledAt: string | null;
  items: OrderItemDto[];
  statusHistory: OrderStatusHistoryDto[];
  payments: OrderPaymentDto[];
  createdAt: string;
  updatedAt: string;
}
