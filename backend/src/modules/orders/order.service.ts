import { Prisma } from '@prisma/client';
import type { OrderStatus } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

import { isPrivileged, requireRestaurantId } from '../../common/authz';
import {
  ConflictError,
  ForbiddenError,
  InsufficientStockError,
  InternalError,
  NotFoundError,
  OrderNotModifiableError,
  ValidationError,
} from '../../common/errors';
import {
  DEFAULT_CURRENCY,
  DEFAULT_GST_PERCENT,
  OUTBOX_AGGREGATE_ORDER,
  OUTBOX_EVENTS,
  SETTING_KEYS,
} from '../../common/constants';
import { buildPaginationMeta, parseSort, toPaginationArgs } from '../../common/pagination';
import type { PaginationMeta } from '../../common/pagination';
import type { RequestContext } from '../../common/types';
import type { Database, PrismaExecutor } from '../../database/prisma';
import { lineSubtotal, orderTotal, sellableQuantity } from '../../utils/decimal';
import { formatOrderNumber } from '../../utils/order-number';
import type { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';
import type { CartRepository } from '../cart/cart.repository';
import type { CartItemWithProduct } from '../cart/cart.types';
import type { InventoryRepository } from '../inventory/inventory.repository';
import type { SettingRepository } from '../settings/setting.repository';
import type { OrderRepository } from './order.repository';
import type { OutboxRepository } from './outbox.repository';
import { toOrderDto } from './order.mapper';
import type { OrderDto, OrderWithRelations } from './order.types';
import type {
  CancelOrderInput,
  ListOrdersQueryInput,
  PlaceOrderInput,
  UpdateOrderStatusInput,
} from './order.schemas';

const SORTABLE_FIELDS = ['createdAt', 'orderNumber', 'status', 'totalAmount'] as const;

/** Permitted state machine (DATABASE.md / OVERVIEW order lifecycle). */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['READY_FOR_DISPATCH', 'CANCELLED'],
  READY_FOR_DISPATCH: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
  REJECTED: [],
};

export class OrderService {
  constructor(
    private readonly db: Database,
    private readonly orders: OrderRepository,
    private readonly carts: CartRepository,
    private readonly inventory: InventoryRepository,
    private readonly outbox: OutboxRepository,
    private readonly settings: SettingRepository,
    private readonly audit: AuditService,
    private readonly logger: FastifyBaseLogger,
  ) {}

  /**
   * Place orders from the active cart. The ENTIRE flow runs in ONE transaction
   * (DATABASE.md Order Creation Flow): re-read current prices, validate stock,
   * reserve inventory with optimistic locking, split items into one order per
   * vendor, snapshot line items, append status history, enqueue an outbox event
   * and check out the cart. Any failure rolls everything back.
   */
  async placeOrder(ctx: RequestContext, input: PlaceOrderInput): Promise<OrderDto[]> {
    const restaurantId = requireRestaurantId(ctx);
    const now = new Date();

    const orderIds = await this.db.$transaction(async (tx) => {
      const cart = await this.carts.getActiveByRestaurant(restaurantId, tx);
      if (!cart || cart.items.length === 0) {
        throw new ValidationError('Your cart is empty');
      }

      const itemsByVendor = this.groupByVendor(cart.items);
      const gstPercent = await this.settings.getNumber(
        SETTING_KEYS.GST_PERCENTAGE,
        DEFAULT_GST_PERCENT,
        tx,
      );
      const deliveryCharges = (
        await this.settings.getNumber(SETTING_KEYS.DELIVERY_CHARGES, 0, tx)
      ).toDecimalPlaces(2);

      const createdIds: string[] = [];

      for (const [vendorId, items] of itemsByVendor) {
        let subtotal = new Prisma.Decimal(0);
        const lineItems: Prisma.OrderItemCreateManyInput[] = [];

        for (const item of items) {
          const product = item.product;
          const currentPrice = product.prices[0];
          if (!currentPrice) {
            throw new ValidationError(`Product "${product.name}" is not purchasable`);
          }

          // Re-read inventory inside the transaction for an up-to-date version.
          const inv = await this.inventory.findByProductId(product.id, tx);
          if (!inv) {
            throw new InsufficientStockError(`No inventory for "${product.name}"`);
          }
          const sellable = sellableQuantity(inv.availableQuantity, inv.reservedQuantity);
          if (sellable.lessThan(item.quantity)) {
            throw new InsufficientStockError(`Insufficient stock for "${product.name}"`, [
              { field: 'productId', message: product.id },
            ]);
          }

          const reserved = await this.inventory.reserve(inv, item.quantity, tx);
          if (!reserved) {
            // Concurrent modification — roll back so the client can retry.
            throw new ConflictError('Inventory changed during checkout, please retry');
          }

          const lineTotal = lineSubtotal(item.quantity, currentPrice.price);
          subtotal = subtotal.plus(lineTotal);
          lineItems.push({
            orderId: '', // set after the order row exists
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            unit: product.unit,
            unitPrice: currentPrice.price,
            quantity: item.quantity,
            subtotal: lineTotal,
          });
        }

        const discountAmount = new Prisma.Decimal(0);
        const gstAmount = subtotal
          .minus(discountAmount)
          .times(gstPercent)
          .dividedBy(100)
          .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        const totalAmount = orderTotal({
          subtotal,
          discountAmount,
          gstAmount,
          deliveryCharges,
        }).toDecimalPlaces(2);

        const sequence = await this.orders.nextOrderNumber(tx);
        const orderNumber = formatOrderNumber(sequence, now.getFullYear());

        const order = await this.orders.create(
          {
            orderNumber,
            status: 'PENDING',
            currency: DEFAULT_CURRENCY,
            subtotal,
            discountAmount,
            gstAmount,
            deliveryCharges,
            totalAmount,
            placedAt: now,
            createdBy: ctx.userId,
            restaurant: { connect: { id: restaurantId } },
            vendor: { connect: { id: vendorId } },
          },
          tx,
        );

        await this.orders.createItems(
          lineItems.map((line) => ({ ...line, orderId: order.id })),
          tx,
        );
        await this.orders.appendStatus(
          {
            orderId: order.id,
            oldStatus: null,
            newStatus: 'PENDING',
            changedBy: ctx.userId,
            remarks: input.notes ?? null,
          },
          tx,
        );
        await this.outbox.enqueue(
          {
            aggregateType: OUTBOX_AGGREGATE_ORDER,
            aggregateId: order.id,
            eventType: OUTBOX_EVENTS.ORDER_PLACED,
            payload: {
              orderId: order.id,
              orderNumber,
              vendorId,
              restaurantId,
              totalAmount: totalAmount.toFixed(2),
            },
          },
          tx,
        );
        await this.audit.record(
          {
            userId: ctx.userId,
            entityType: 'order',
            entityId: order.id,
            action: AUDIT_ACTIONS.ORDER_PLACED,
            newValue: { orderNumber, vendorId, totalAmount: totalAmount.toFixed(2) },
            ipAddress: ctx.ipAddress,
            userAgent: ctx.userAgent,
            requestId: ctx.requestId,
          },
          tx,
        );

        createdIds.push(order.id);
      }

      await this.carts.updateStatus(cart.id, 'CHECKED_OUT', tx);
      return createdIds;
    });

    this.logger.info({ restaurantId, orderCount: orderIds.length }, 'orders placed');

    const result: OrderDto[] = [];
    for (const id of orderIds) {
      const order = await this.orders.findByIdWithRelations(id);
      if (!order) {
        throw new InternalError('Order not found after creation');
      }
      result.push(toOrderDto(order));
    }
    return result;
  }

  async getById(id: string, ctx: RequestContext): Promise<OrderDto> {
    const order = await this.orders.findByIdWithRelations(id);
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    this.assertCanView(order, ctx);
    return toOrderDto(order);
  }

  async list(
    query: ListOrdersQueryInput,
    ctx: RequestContext,
  ): Promise<{ items: OrderDto[]; pagination: PaginationMeta }> {
    const where: Prisma.OrderWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }

    if (isPrivileged(ctx)) {
      if (query.vendorId) {
        where.vendorId = query.vendorId;
      }
      if (query.restaurantId) {
        where.restaurantId = query.restaurantId;
      }
    } else if (ctx.vendorId) {
      where.vendorId = ctx.vendorId;
    } else if (ctx.restaurantId) {
      where.restaurantId = ctx.restaurantId;
    } else {
      throw new ForbiddenError('No vendor or restaurant profile is associated with this account');
    }

    const orderBy = parseSort(query.sort, SORTABLE_FIELDS).map((sort) => ({
      [sort.field]: sort.direction,
    })) as Prisma.OrderOrderByWithRelationInput[];

    const { skip, take } = toPaginationArgs(query);
    const result = await this.orders.list({ skip, take, where, orderBy });
    return {
      items: result.items.map(toOrderDto),
      pagination: buildPaginationMeta(result.total, query),
    };
  }

  /** Vendor/operations status transition (accept, process, dispatch, deliver, reject). */
  async updateStatus(
    id: string,
    input: UpdateOrderStatusInput,
    ctx: RequestContext,
  ): Promise<OrderDto> {
    const order = await this.orders.findByIdWithRelations(id);
    if (!order) {
      throw new NotFoundError('Order not found');
    }

    const privileged = isPrivileged(ctx);
    if (!privileged) {
      if (!ctx.vendorId || order.vendorId !== ctx.vendorId) {
        throw new ForbiddenError('You can only manage your own orders');
      }
      if (input.status === 'CANCELLED') {
        throw new ForbiddenError('Use the cancel endpoint to cancel an order');
      }
    }

    this.assertTransitionAllowed(order.status, input.status);
    await this.db.$transaction((tx) =>
      this.applyTransition(order, input.status, input.remarks ?? null, ctx, tx),
    );
    return this.requireDto(id);
  }

  /** Restaurant/operations cancellation. Releases reserved stock. */
  async cancel(id: string, input: CancelOrderInput, ctx: RequestContext): Promise<OrderDto> {
    const order = await this.orders.findByIdWithRelations(id);
    if (!order) {
      throw new NotFoundError('Order not found');
    }

    const privileged = isPrivileged(ctx);
    if (!privileged) {
      if (!ctx.restaurantId || order.restaurantId !== ctx.restaurantId) {
        throw new ForbiddenError('You can only cancel your own orders');
      }
      if (order.status !== 'PENDING' && order.status !== 'ACCEPTED') {
        throw new OrderNotModifiableError('This order can no longer be cancelled');
      }
    }

    this.assertTransitionAllowed(order.status, 'CANCELLED');
    await this.db.$transaction((tx) =>
      this.applyTransition(order, 'CANCELLED', input.reason ?? null, ctx, tx),
    );
    return this.requireDto(id);
  }

  private async applyTransition(
    order: OrderWithRelations,
    newStatus: OrderStatus,
    remarks: string | null,
    ctx: RequestContext,
    tx: PrismaExecutor,
  ): Promise<void> {
    if (newStatus === 'CANCELLED' || newStatus === 'REJECTED') {
      await this.releaseStock(order, tx);
    } else if (newStatus === 'DELIVERED') {
      await this.fulfilStock(order, tx);
    }

    const data: Prisma.OrderUpdateInput = { status: newStatus };
    const now = new Date();
    if (newStatus === 'ACCEPTED') {
      data.acceptedAt = now;
    } else if (newStatus === 'DELIVERED') {
      data.deliveredAt = now;
    } else if (newStatus === 'CANCELLED') {
      data.cancelledAt = now;
    }

    await this.orders.updateStatusFields(order.id, data, tx);
    await this.orders.appendStatus(
      {
        orderId: order.id,
        oldStatus: order.status,
        newStatus,
        changedBy: ctx.userId,
        remarks,
      },
      tx,
    );
    await this.outbox.enqueue(
      {
        aggregateType: OUTBOX_AGGREGATE_ORDER,
        aggregateId: order.id,
        eventType: OUTBOX_EVENTS.ORDER_STATUS_CHANGED,
        payload: { orderId: order.id, from: order.status, to: newStatus },
      },
      tx,
    );
    await this.audit.record(
      {
        userId: ctx.userId,
        entityType: 'order',
        entityId: order.id,
        action: this.auditActionFor(newStatus),
        oldValue: { status: order.status },
        newValue: { status: newStatus, remarks },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      },
      tx,
    );
  }

  private async releaseStock(order: OrderWithRelations, tx: PrismaExecutor): Promise<void> {
    for (const item of order.items) {
      const inv = await this.inventory.findByProductId(item.productId, tx);
      if (!inv) {
        continue;
      }
      const ok = await this.inventory.release(inv, item.quantity, tx);
      if (!ok) {
        throw new ConflictError('Inventory changed during update, please retry');
      }
    }
  }

  private async fulfilStock(order: OrderWithRelations, tx: PrismaExecutor): Promise<void> {
    for (const item of order.items) {
      const inv = await this.inventory.findByProductId(item.productId, tx);
      if (!inv) {
        continue;
      }
      const ok = await this.inventory.fulfil(inv, item.quantity, tx);
      if (!ok) {
        throw new ConflictError('Inventory changed during update, please retry');
      }
    }
  }

  private groupByVendor(items: CartItemWithProduct[]): Map<string, CartItemWithProduct[]> {
    const grouped = new Map<string, CartItemWithProduct[]>();
    for (const item of items) {
      const product = item.product;
      if (product.status !== 'ACTIVE') {
        throw new ValidationError(`Product "${product.name}" is no longer available`);
      }
      const bucket = grouped.get(product.vendorId);
      if (bucket) {
        bucket.push(item);
      } else {
        grouped.set(product.vendorId, [item]);
      }
    }
    return grouped;
  }

  private assertTransitionAllowed(from: OrderStatus, to: OrderStatus): void {
    if (!ALLOWED_TRANSITIONS[from].includes(to)) {
      throw new OrderNotModifiableError(`Cannot change order from ${from} to ${to}`);
    }
  }

  private assertCanView(order: OrderWithRelations, ctx: RequestContext): void {
    if (isPrivileged(ctx)) {
      return;
    }
    if (ctx.vendorId && order.vendorId === ctx.vendorId) {
      return;
    }
    if (ctx.restaurantId && order.restaurantId === ctx.restaurantId) {
      return;
    }
    throw new ForbiddenError('You do not have access to this order');
  }

  private auditActionFor(status: OrderStatus): string {
    switch (status) {
      case 'ACCEPTED':
        return AUDIT_ACTIONS.ORDER_ACCEPTED;
      case 'REJECTED':
        return AUDIT_ACTIONS.ORDER_REJECTED;
      case 'CANCELLED':
        return AUDIT_ACTIONS.ORDER_CANCELLED;
      default:
        return AUDIT_ACTIONS.ORDER_STATUS_CHANGED;
    }
  }

  private async requireDto(id: string): Promise<OrderDto> {
    const order = await this.orders.findByIdWithRelations(id);
    if (!order) {
      throw new InternalError('Order not found after update');
    }
    return toOrderDto(order);
  }
}
