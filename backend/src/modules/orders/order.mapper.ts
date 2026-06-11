import { toMoneyString, toQuantityString } from '../../utils/decimal';
import type { OrderDto, OrderWithRelations } from './order.types';

export function toOrderDto(order: OrderWithRelations): OrderDto {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    restaurantId: order.restaurantId,
    restaurantName: order.restaurant?.restaurantName ?? null,
    vendorId: order.vendorId,
    vendorName: order.vendor?.vendorName ?? null,
    status: order.status,
    currency: order.currency,
    subtotal: toMoneyString(order.subtotal),
    discountAmount: toMoneyString(order.discountAmount),
    gstAmount: toMoneyString(order.gstAmount),
    deliveryCharges: toMoneyString(order.deliveryCharges),
    totalAmount: toMoneyString(order.totalAmount),
    placedAt: order.placedAt?.toISOString() ?? null,
    acceptedAt: order.acceptedAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    items: order.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      unit: item.unit,
      unitPrice: toMoneyString(item.unitPrice),
      quantity: toQuantityString(item.quantity),
      subtotal: toMoneyString(item.subtotal),
    })),
    statusHistory: order.statusHistory.map((history) => ({
      id: history.id,
      oldStatus: history.oldStatus,
      newStatus: history.newStatus,
      changedBy: history.changedBy,
      remarks: history.remarks,
      createdAt: history.createdAt.toISOString(),
    })),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
