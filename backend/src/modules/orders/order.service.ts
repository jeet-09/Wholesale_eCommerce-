import { Prisma } from '@prisma/client';
import type { OrderStatus } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

import { isPrivileged, requireRestaurantId, requireVendorId } from '../../common/authz';
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
  DEFAULT_ADVANCE_PERCENT,
  DEFAULT_CURRENCY,
  DEFAULT_GST_PERCENT,
  DEFAULT_SAME_DAY_SURCHARGE,
  MAX_DELIVERY_DAYS_AHEAD,
  OUTBOX_AGGREGATE_ORDER,
  OUTBOX_EVENTS,
  SETTING_KEYS,
} from '../../common/constants';
import { buildPaginationMeta, parseSort, toPaginationArgs } from '../../common/pagination';
import type { PaginationMeta } from '../../common/pagination';
import type { RequestContext } from '../../common/types';
import type { Database, PrismaExecutor } from '../../database/prisma';
import { lineSubtotal, orderTotal, percentOf, sellableQuantity } from '../../utils/decimal';
import { formatOrderNumber } from '../../utils/order-number';
import type { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';
import type { CartRepository } from '../cart/cart.repository';
import type { OfferRepository } from '../vendor-offers/offer.repository';
import type { PerformanceRepository } from '../vendor-performance/performance.repository';
import type { SettingRepository } from '../settings/setting.repository';
import type { VendorRepository } from '../vendors/vendor.repository';
import type { OrderRepository } from './order.repository';
import type { OutboxRepository } from './outbox.repository';
import { toOrderDto } from './order.mapper';
import type { OrderDto, OrderWithRelations } from './order.types';
import type {
  AssignVendorInput,
  CancelOrderInput,
  CompleteOrderInput,
  ListOrdersQueryInput,
  OverrideStatusInput,
  PlaceOrderInput,
  RejectOrderInput,
  UpdateFulfilmentInput,
  VendorRespondInput,
} from './order.schemas';

const SORTABLE_FIELDS = ['createdAt', 'orderNumber', 'status', 'totalAmount'] as const;

/**
 * Procurement lifecycle (project-working.md ORDER STATUS FLOW). A vendor rejecting
 * an assignment sends the order BACK to PENDING_ADMIN_REVIEW so Administration can
 * re-assign; REJECTED is a terminal admin decision.
 */
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ['PENDING_PAYMENT', 'CANCELLED'],
  PENDING_PAYMENT: ['PAYMENT_RECEIVED', 'CANCELLED'],
  PAYMENT_RECEIVED: ['PENDING_ADMIN_REVIEW', 'CANCELLED'],
  PENDING_ADMIN_REVIEW: ['VENDOR_ASSIGNED', 'REJECTED', 'CANCELLED'],
  VENDOR_ASSIGNED: ['VENDOR_ACCEPTED', 'PENDING_ADMIN_REVIEW', 'REJECTED', 'CANCELLED'],
  VENDOR_ACCEPTED: ['PROCESSING', 'REJECTED', 'CANCELLED'],
  PROCESSING: ['READY_FOR_DELIVERY', 'CANCELLED'],
  READY_FOR_DELIVERY: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'CANCELLED'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

/** Statuses in which a vendor still holds reserved offer stock. */
const RESERVED_STATUSES: OrderStatus[] = [
  'VENDOR_ASSIGNED',
  'VENDOR_ACCEPTED',
  'PROCESSING',
  'READY_FOR_DELIVERY',
  'OUT_FOR_DELIVERY',
];

/** Terminal statuses — the order card moves to the "archived" board. */
const ARCHIVED_STATUSES: OrderStatus[] = ['COMPLETED', 'REJECTED', 'CANCELLED'];

/** Start of `date` in the server's local time zone (midnight). */
function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Resolve a `YYYY-MM-DD` delivery request against the server clock.
 * Throws if the date is malformed, in the past, or beyond the booking window.
 */
function resolveDeliveryDate(input: string, now: Date): { date: Date; isSameDay: boolean } {
  const parts = input.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    throw new ValidationError('Invalid delivery date');
  }
  const today = startOfDay(now);
  const latest = startOfDay(now);
  latest.setDate(latest.getDate() + MAX_DELIVERY_DAYS_AHEAD);
  if (date.getTime() < today.getTime()) {
    throw new ValidationError('Delivery date cannot be in the past');
  }
  if (date.getTime() > latest.getTime()) {
    throw new ValidationError(
      `Delivery date cannot be more than ${MAX_DELIVERY_DAYS_AHEAD} days from today`,
    );
  }
  return { date, isSameDay: date.getTime() === today.getTime() };
}

export class OrderService {
  constructor(
    private readonly db: Database,
    private readonly orders: OrderRepository,
    private readonly carts: CartRepository,
    private readonly offers: OfferRepository,
    private readonly performance: PerformanceRepository,
    private readonly vendors: VendorRepository,
    private readonly outbox: OutboxRepository,
    private readonly settings: SettingRepository,
    private readonly audit: AuditService,
    private readonly logger: FastifyBaseLogger,
  ) {}

  /**
   * Place an order from the active cart in ONE transaction (project-working.md
   * BUSINESS FLOW): snapshot current selling prices, compute totals + the 30%
   * advance, and create the order in PENDING_PAYMENT. No vendor is assigned and
   * no stock is reserved yet — that happens after Administration review.
   */
  async placeOrder(ctx: RequestContext, input: PlaceOrderInput): Promise<OrderDto> {
    const restaurantId = requireRestaurantId(ctx);
    const now = new Date();
    const { date: requestedDeliveryDate, isSameDay } = resolveDeliveryDate(
      input.requestedDeliveryDate,
      now,
    );

    const orderId = await this.db.$transaction(async (tx) => {
      const cart = await this.carts.getActiveByRestaurant(restaurantId, tx);
      if (!cart || cart.items.length === 0) {
        throw new ValidationError('Your cart is empty');
      }

      const gstPercent = await this.settings.getNumber(
        SETTING_KEYS.GST_PERCENTAGE,
        DEFAULT_GST_PERCENT,
        tx,
      );
      const baseDelivery = (
        await this.settings.getNumber(SETTING_KEYS.DELIVERY_CHARGES, 0, tx)
      ).toDecimalPlaces(2);
      // Same-day requests pay a surcharge; it is folded into deliveryCharges so
      // the order-total CHECK holds, and recorded in sameDayCharge for the breakdown.
      const sameDayCharge = isSameDay
        ? (
            await this.settings.getNumber(
              SETTING_KEYS.SAME_DAY_DELIVERY_SURCHARGE,
              DEFAULT_SAME_DAY_SURCHARGE,
              tx,
            )
          ).toDecimalPlaces(2)
        : new Prisma.Decimal(0);
      const deliveryCharges = baseDelivery.plus(sameDayCharge).toDecimalPlaces(2);
      const advancePercent = await this.settings.getNumber(
        SETTING_KEYS.ADVANCE_PERCENTAGE,
        DEFAULT_ADVANCE_PERCENT,
        tx,
      );

      let subtotal = new Prisma.Decimal(0);
      const lineItems: Prisma.OrderItemCreateManyInput[] = [];

      for (const item of cart.items) {
        const product = item.product;
        if (product.status !== 'APPROVED') {
          throw new ValidationError(`Product "${product.name}" is no longer available`);
        }
        const currentPrice = product.prices[0];
        if (!currentPrice) {
          throw new ValidationError(`Product "${product.name}" is not purchasable`);
        }

        const lineTotal = lineSubtotal(item.quantity, currentPrice.price);
        subtotal = subtotal.plus(lineTotal);
        lineItems.push({
          orderId: '',
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
      const advanceAmount = percentOf(totalAmount, advancePercent);
      const remainingAmount = totalAmount.minus(advanceAmount);

      const sequence = await this.orders.nextOrderNumber(tx);
      const orderNumber = formatOrderNumber(sequence, now.getFullYear());

      const order = await this.orders.create(
        {
          orderNumber,
          status: 'PENDING_PAYMENT',
          currency: DEFAULT_CURRENCY,
          subtotal,
          discountAmount,
          gstAmount,
          deliveryCharges,
          totalAmount,
          advancePercent,
          advanceAmount,
          remainingAmount,
          requestedDeliveryDate,
          isSameDayDelivery: isSameDay,
          sameDayCharge,
          placedAt: now,
          createdBy: ctx.userId,
          restaurant: { connect: { id: restaurantId } },
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
          newStatus: 'PENDING_PAYMENT',
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
            restaurantId,
            totalAmount: totalAmount.toFixed(2),
            advanceAmount: advanceAmount.toFixed(2),
            requestedDeliveryDate: requestedDeliveryDate.toISOString(),
            isSameDayDelivery: isSameDay,
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
          newValue: {
            orderNumber,
            totalAmount: totalAmount.toFixed(2),
            advanceAmount: advanceAmount.toFixed(2),
          },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        },
        tx,
      );

      await this.carts.updateStatus(cart.id, 'CHECKED_OUT', tx);
      return order.id;
    });

    this.logger.info({ restaurantId, orderId }, 'order placed');
    return this.requireDto(orderId);
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
    } else if (query.statusGroup === 'ARCHIVED') {
      where.status = { in: ARCHIVED_STATUSES };
    } else if (query.statusGroup === 'ACTIVE') {
      where.status = { notIn: ARCHIVED_STATUSES };
    }

    if (isPrivileged(ctx)) {
      if (query.vendorId) {
        where.assignedVendorId = query.vendorId;
      }
      if (query.restaurantId) {
        where.restaurantId = query.restaurantId;
      }
    } else if (ctx.vendorId) {
      where.assignedVendorId = ctx.vendorId;
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

  /**
   * Administration assigns a vendor to a reviewed order: reserve the vendor's
   * offer stock (optimistic lock) and bump the "assigned" performance counter.
   */
  async assignVendor(id: string, input: AssignVendorInput, ctx: RequestContext): Promise<OrderDto> {
    const order = await this.orders.findByIdWithRelations(id);
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    this.assertTransitionAllowed(order.status, 'VENDOR_ASSIGNED');

    const vendor = await this.vendors.findById(input.vendorId);
    if (!vendor || vendor.deletedAt) {
      throw new NotFoundError('Vendor not found');
    }
    if (vendor.status !== 'ACTIVE') {
      throw new ValidationError('Vendor is not active');
    }

    const now = new Date();
    await this.db.$transaction(async (tx) => {
      await this.reserveForVendor(order, input.vendorId, tx);
      await this.performance.ensure(input.vendorId, tx);
      await this.performance.increment(input.vendorId, { totalAssigned: { increment: 1 } }, tx);
      await this.recordTransition(order, 'VENDOR_ASSIGNED', {
        assignedVendor: { connect: { id: input.vendorId } },
        assignedBy: ctx.userId,
        assignedAt: now,
        reviewedAt: order.reviewedAt ?? now,
      }, ctx, tx, {
        remarks: input.remarks ?? null,
        event: OUTBOX_EVENTS.ORDER_VENDOR_ASSIGNED,
        auditAction: AUDIT_ACTIONS.ORDER_VENDOR_ASSIGNED,
        auditNew: { vendorId: input.vendorId },
      });
    });

    return this.requireDto(id);
  }

  /** Vendor accepts or rejects the assignment. Reject returns the order to review. */
  async vendorRespond(id: string, input: VendorRespondInput, ctx: RequestContext): Promise<OrderDto> {
    const vendorId = requireVendorId(ctx);
    const order = await this.orders.findByIdWithRelations(id);
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    if (order.assignedVendorId !== vendorId) {
      throw new ForbiddenError('This order is not assigned to you');
    }
    if (order.status !== 'VENDOR_ASSIGNED') {
      throw new OrderNotModifiableError('This order is not awaiting your response');
    }

    const now = new Date();
    if (input.accept) {
      await this.db.$transaction(async (tx) => {
        await this.performance.increment(vendorId, { totalAccepted: { increment: 1 } }, tx);
        await this.recordTransition(order, 'VENDOR_ACCEPTED', { acceptedAt: now }, ctx, tx, {
          remarks: input.remarks ?? null,
          event: OUTBOX_EVENTS.ORDER_STATUS_CHANGED,
          auditAction: AUDIT_ACTIONS.ORDER_ACCEPTED,
        });
      });
    } else {
      await this.db.$transaction(async (tx) => {
        await this.releaseForVendor(order, vendorId, tx);
        await this.performance.increment(vendorId, { totalRejected: { increment: 1 } }, tx);
        await this.recordTransition(order, 'PENDING_ADMIN_REVIEW', {
          assignedVendor: { disconnect: true },
          assignedAt: null,
        }, ctx, tx, {
          remarks: input.remarks ?? 'Vendor declined the assignment',
          event: OUTBOX_EVENTS.ORDER_STATUS_CHANGED,
          auditAction: AUDIT_ACTIONS.ORDER_REJECTED,
        });
      });
    }

    return this.requireDto(id);
  }

  /**
   * Vendor advances fulfilment: PROCESSING → READY_FOR_DELIVERY →
   * OUT_FOR_DELIVERY → DELIVERED. Dispatching (OUT_FOR_DELIVERY) records the
   * delivery contact, an optional dispatch note, and — when stock was short —
   * the actual quantity sent per line item (partial fulfilment).
   */
  async updateFulfilment(
    id: string,
    input: UpdateFulfilmentInput,
    ctx: RequestContext,
  ): Promise<OrderDto> {
    const vendorId = requireVendorId(ctx);
    const order = await this.orders.findByIdWithRelations(id);
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    if (order.assignedVendorId !== vendorId) {
      throw new ForbiddenError('This order is not assigned to you');
    }
    this.assertTransitionAllowed(order.status, input.status);

    const now = new Date();
    const data: Prisma.OrderUpdateInput = {};
    let event: string = OUTBOX_EVENTS.ORDER_STATUS_CHANGED;
    let auditNew: Record<string, unknown> | undefined;

    if (input.status === 'READY_FOR_DELIVERY') {
      data.readyAt = now;
    } else if (input.status === 'OUT_FOR_DELIVERY') {
      data.dispatchedAt = now;
      data.deliveryContactPhone = input.deliveryContactPhone ?? null;
      data.dispatchNote = input.dispatchNote ?? null;
      event = OUTBOX_EVENTS.ORDER_OUT_FOR_DELIVERY;
      auditNew = {
        deliveryContactPhone: input.deliveryContactPhone ?? null,
        partialLines: input.deliveredItems?.length ?? 0,
      };
    } else if (input.status === 'DELIVERED') {
      data.deliveredAt = now;
      event = OUTBOX_EVENTS.ORDER_DELIVERED;
    }

    // Partial-fulfilment quantities are only meaningful at dispatch; validate
    // that every referenced line actually belongs to this order.
    const deliveredItems = input.deliveredItems ?? [];
    if (deliveredItems.length > 0) {
      const orderItemIds = new Set(order.items.map((item) => item.id));
      for (const line of deliveredItems) {
        if (!orderItemIds.has(line.orderItemId)) {
          throw new ValidationError('A dispatched item does not belong to this order', [
            { field: 'deliveredItems', message: line.orderItemId },
          ]);
        }
      }
    }

    await this.db.$transaction(async (tx) => {
      for (const line of deliveredItems) {
        await this.orders.setItemDeliveredQuantity(
          order.id,
          line.orderItemId,
          new Prisma.Decimal(line.deliveredQuantity),
          tx,
        );
      }
      await this.recordTransition(order, input.status, data, ctx, tx, {
        remarks: input.remarks ?? input.dispatchNote ?? null,
        event,
        auditAction: AUDIT_ACTIONS.ORDER_STATUS_CHANGED,
        auditNew,
      });
    });
    return this.requireDto(id);
  }

  /**
   * Confirms a delivered order as COMPLETED: fulfil the reserved stock and roll
   * the vendor's performance counters (completion, fulfilment time, rating).
   * The restaurant that owns the order confirms it and leaves a 1-5★ review;
   * Administration can also complete as a fallback (rating optional).
   */
  async complete(id: string, input: CompleteOrderInput, ctx: RequestContext): Promise<OrderDto> {
    const order = await this.orders.findByIdWithRelations(id);
    if (!order) {
      throw new NotFoundError('Order not found');
    }

    const actingAsRestaurant = !isPrivileged(ctx);
    if (actingAsRestaurant) {
      if (!ctx.restaurantId || order.restaurantId !== ctx.restaurantId) {
        throw new ForbiddenError('You can only complete your own orders');
      }
      if (!input.rating) {
        throw new ValidationError('Please rate your order (1-5 stars) to complete it');
      }
    }

    this.assertTransitionAllowed(order.status, 'COMPLETED');
    const vendorId = order.assignedVendorId;
    if (!vendorId) {
      throw new ValidationError('Order has no assigned vendor');
    }

    const now = new Date();
    const startedAt = order.acceptedAt ?? order.assignedAt;
    const fulfilmentMinutes = startedAt
      ? Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 60000))
      : 0;

    const completionData: Prisma.OrderUpdateInput = { completedAt: now };
    if (input.rating) {
      completionData.customerRating = input.rating;
      completionData.customerReview = input.review ?? null;
      completionData.ratedAt = now;
    }

    await this.db.$transaction(async (tx) => {
      await this.fulfilForVendor(order, vendorId, tx);
      await this.performance.ensure(vendorId, tx);
      const increment: Prisma.VendorPerformanceUpdateInput = {
        totalCompleted: { increment: 1 },
        fulfilmentMinutesTotal: { increment: fulfilmentMinutes },
      };
      if (input.rating) {
        increment.ratingSum = { increment: input.rating };
        increment.ratingCount = { increment: 1 };
      }
      await this.performance.increment(vendorId, increment, tx);
      await this.recordTransition(order, 'COMPLETED', completionData, ctx, tx, {
        remarks: input.remarks ?? input.review ?? null,
        event: OUTBOX_EVENTS.ORDER_COMPLETED,
        auditAction: AUDIT_ACTIONS.ORDER_COMPLETED,
        auditNew: { vendorId, rating: input.rating ?? null, fulfilmentMinutes },
      });
    });

    return this.requireDto(id);
  }

  /** Administration hard-rejects an order. Releases any reserved stock. */
  async reject(id: string, input: RejectOrderInput, ctx: RequestContext): Promise<OrderDto> {
    const order = await this.orders.findByIdWithRelations(id);
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    this.assertTransitionAllowed(order.status, 'REJECTED');

    const now = new Date();
    await this.db.$transaction(async (tx) => {
      if (order.assignedVendorId && RESERVED_STATUSES.includes(order.status)) {
        await this.releaseForVendor(order, order.assignedVendorId, tx);
      }
      await this.recordTransition(order, 'REJECTED', { rejectedAt: now }, ctx, tx, {
        remarks: input.reason ?? null,
        event: OUTBOX_EVENTS.ORDER_STATUS_CHANGED,
        auditAction: AUDIT_ACTIONS.ORDER_REJECTED,
      });
    });
    return this.requireDto(id);
  }

  /** Restaurant (pre-acceptance) or Administration cancellation. Releases stock. */
  async cancel(id: string, input: CancelOrderInput, ctx: RequestContext): Promise<OrderDto> {
    const order = await this.orders.findByIdWithRelations(id);
    if (!order) {
      throw new NotFoundError('Order not found');
    }

    if (!isPrivileged(ctx)) {
      if (!ctx.restaurantId || order.restaurantId !== ctx.restaurantId) {
        throw new ForbiddenError('You can only cancel your own orders');
      }
      const cancellableByRestaurant: OrderStatus[] = [
        'PENDING_PAYMENT',
        'PAYMENT_RECEIVED',
        'PENDING_ADMIN_REVIEW',
      ];
      if (!cancellableByRestaurant.includes(order.status)) {
        throw new OrderNotModifiableError('This order can no longer be cancelled');
      }
    }

    this.assertTransitionAllowed(order.status, 'CANCELLED');
    const now = new Date();
    await this.db.$transaction(async (tx) => {
      if (order.assignedVendorId && RESERVED_STATUSES.includes(order.status)) {
        await this.releaseForVendor(order, order.assignedVendorId, tx);
      }
      await this.recordTransition(order, 'CANCELLED', { cancelledAt: now }, ctx, tx, {
        remarks: input.reason ?? null,
        event: OUTBOX_EVENTS.ORDER_STATUS_CHANGED,
        auditAction: AUDIT_ACTIONS.ORDER_CANCELLED,
      });
    });
    return this.requireDto(id);
  }

  /**
   * Admin-only out-of-band status correction. Bypasses the normal state machine
   * so staff can unstick or re-route an order, but still records full status
   * history, an audit entry, and an outbox event. Reserved offer stock is
   * released when the order leaves a reserved status for a non-reserved one.
   *
   * Note: overriding *into* VENDOR_ASSIGNED does NOT pick a vendor or reserve
   * stock — use Assign for that. This is a deliberate safety boundary.
   */
  async overrideStatus(
    id: string,
    input: OverrideStatusInput,
    ctx: RequestContext,
  ): Promise<OrderDto> {
    const order = await this.orders.findByIdWithRelations(id);
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    const target = input.status;
    if (order.status === target) {
      throw new ValidationError('Order is already in that status');
    }

    const now = new Date();
    await this.db.$transaction(async (tx) => {
      const leavingReserved =
        Boolean(order.assignedVendorId) &&
        RESERVED_STATUSES.includes(order.status) &&
        !RESERVED_STATUSES.includes(target);
      if (leavingReserved && order.assignedVendorId) {
        await this.releaseForVendor(order, order.assignedVendorId, tx);
      }

      await this.recordTransition(
        order,
        target,
        this.overrideTimestamps(target, order, now),
        ctx,
        tx,
        {
          remarks: input.remarks ?? 'Status overridden by admin',
          event: OUTBOX_EVENTS.ORDER_STATUS_CHANGED,
          auditAction: AUDIT_ACTIONS.ORDER_STATUS_OVERRIDDEN,
          auditNew: { status: target, from: order.status, override: true },
        },
      );
    });

    return this.requireDto(id);
  }

  /** Best-effort milestone timestamps so the card stepper stays coherent after an override. */
  private overrideTimestamps(
    target: OrderStatus,
    order: OrderWithRelations,
    now: Date,
  ): Prisma.OrderUpdateInput {
    switch (target) {
      case 'PAYMENT_RECEIVED':
        return { paymentVerifiedAt: order.paymentVerifiedAt ?? now };
      case 'PENDING_ADMIN_REVIEW':
        return { reviewedAt: order.reviewedAt ?? now };
      case 'VENDOR_ACCEPTED':
        return { acceptedAt: order.acceptedAt ?? now };
      case 'READY_FOR_DELIVERY':
        return { readyAt: order.readyAt ?? now };
      case 'OUT_FOR_DELIVERY':
        return { dispatchedAt: order.dispatchedAt ?? now };
      case 'DELIVERED':
        return { deliveredAt: order.deliveredAt ?? now };
      case 'COMPLETED':
        return { completedAt: order.completedAt ?? now };
      case 'REJECTED':
        return { rejectedAt: order.rejectedAt ?? now };
      case 'CANCELLED':
        return { cancelledAt: order.cancelledAt ?? now };
      default:
        return {};
    }
  }

  /**
   * Called by the payments module inside its verification transaction: a verified
   * advance moves PENDING_PAYMENT → PAYMENT_RECEIVED → PENDING_ADMIN_REVIEW.
   */
  async markPaymentVerified(orderId: string, ctx: RequestContext, tx: PrismaExecutor): Promise<void> {
    const order = await this.orders.findById(orderId, tx);
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    if (order.status !== 'PENDING_PAYMENT') {
      throw new OrderNotModifiableError('Order is not awaiting payment');
    }
    const now = new Date();
    await this.orders.updateStatusFields(
      orderId,
      { status: 'PAYMENT_RECEIVED', paymentVerifiedAt: now },
      tx,
    );
    await this.orders.appendStatus(
      {
        orderId,
        oldStatus: 'PENDING_PAYMENT',
        newStatus: 'PAYMENT_RECEIVED',
        changedBy: ctx.userId,
        remarks: 'Advance payment verified',
      },
      tx,
    );
    await this.orders.updateStatusFields(orderId, { status: 'PENDING_ADMIN_REVIEW' }, tx);
    await this.orders.appendStatus(
      {
        orderId,
        oldStatus: 'PAYMENT_RECEIVED',
        newStatus: 'PENDING_ADMIN_REVIEW',
        changedBy: ctx.userId,
        remarks: null,
      },
      tx,
    );
    await this.outbox.enqueue(
      {
        aggregateType: OUTBOX_AGGREGATE_ORDER,
        aggregateId: orderId,
        eventType: OUTBOX_EVENTS.ORDER_PAYMENT_VERIFIED,
        payload: { orderId },
      },
      tx,
    );
  }

  /** Called by the payments module when a restaurant submits its advance proof. */
  async markPaymentSubmitted(
    orderId: string,
    ctx: RequestContext,
    tx: PrismaExecutor,
  ): Promise<void> {
    const order = await this.orders.findById(orderId, tx);
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    if (order.status !== 'PENDING_PAYMENT') {
      throw new OrderNotModifiableError('Order is not awaiting payment');
    }
    await this.orders.updateStatusFields(orderId, { paymentSubmittedAt: new Date() }, tx);
    await this.outbox.enqueue(
      {
        aggregateType: OUTBOX_AGGREGATE_ORDER,
        aggregateId: orderId,
        eventType: OUTBOX_EVENTS.ORDER_PAYMENT_SUBMITTED,
        payload: { orderId },
      },
      tx,
    );
    void ctx;
  }

  private async recordTransition(
    order: OrderWithRelations,
    newStatus: OrderStatus,
    data: Prisma.OrderUpdateInput,
    ctx: RequestContext,
    tx: PrismaExecutor,
    opts: {
      remarks?: string | null;
      event: string;
      auditAction: string;
      auditNew?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.orders.updateStatusFields(order.id, { ...data, status: newStatus }, tx);
    await this.orders.appendStatus(
      {
        orderId: order.id,
        oldStatus: order.status,
        newStatus,
        changedBy: ctx.userId,
        remarks: opts.remarks ?? null,
      },
      tx,
    );
    await this.outbox.enqueue(
      {
        aggregateType: OUTBOX_AGGREGATE_ORDER,
        aggregateId: order.id,
        eventType: opts.event,
        payload: { orderId: order.id, from: order.status, to: newStatus },
      },
      tx,
    );
    await this.audit.record(
      {
        userId: ctx.userId,
        entityType: 'order',
        entityId: order.id,
        action: opts.auditAction,
        oldValue: { status: order.status },
        newValue: { status: newStatus, ...(opts.auditNew ?? {}) },
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        requestId: ctx.requestId,
      },
      tx,
    );
  }

  private async reserveForVendor(
    order: OrderWithRelations,
    vendorId: string,
    tx: PrismaExecutor,
  ): Promise<void> {
    for (const item of order.items) {
      const offer = await this.offers.findByVendorAndProduct(vendorId, item.productId, tx);
      if (!offer || offer.status !== 'APPROVED') {
        throw new ValidationError(`Vendor does not supply "${item.productName}"`);
      }
      const sellable = sellableQuantity(offer.availableQuantity, offer.reservedQuantity);
      if (sellable.lessThan(item.quantity)) {
        throw new InsufficientStockError(`Insufficient stock for "${item.productName}"`, [
          { field: 'productId', message: item.productId },
        ]);
      }
      const reserved = await this.offers.reserve(offer, item.quantity, tx);
      if (!reserved) {
        throw new ConflictError('Vendor stock changed during assignment, please retry');
      }
    }
  }

  private async releaseForVendor(
    order: OrderWithRelations,
    vendorId: string,
    tx: PrismaExecutor,
  ): Promise<void> {
    for (const item of order.items) {
      const offer = await this.offers.findByVendorAndProduct(vendorId, item.productId, tx);
      if (!offer) {
        continue;
      }
      const ok = await this.offers.release(offer, item.quantity, tx);
      if (!ok) {
        throw new ConflictError('Vendor stock changed during update, please retry');
      }
    }
  }

  private async fulfilForVendor(
    order: OrderWithRelations,
    vendorId: string,
    tx: PrismaExecutor,
  ): Promise<void> {
    for (const item of order.items) {
      const offer = await this.offers.findByVendorAndProduct(vendorId, item.productId, tx);
      if (!offer) {
        continue;
      }
      const ok = await this.offers.fulfil(offer, item.quantity, tx);
      if (!ok) {
        throw new ConflictError('Vendor stock changed during completion, please retry');
      }
    }
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
    if (ctx.vendorId && order.assignedVendorId === ctx.vendorId) {
      return;
    }
    if (ctx.restaurantId && order.restaurantId === ctx.restaurantId) {
      return;
    }
    throw new ForbiddenError('You do not have access to this order');
  }

  private async requireDto(id: string): Promise<OrderDto> {
    const order = await this.orders.findByIdWithRelations(id);
    if (!order) {
      throw new InternalError('Order not found after update');
    }
    return toOrderDto(order);
  }
}
