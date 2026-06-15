import { Prisma } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

import { isPrivileged, requireRestaurantId } from '../../common/authz';
import { ForbiddenError, InternalError, NotFoundError, ValidationError } from '../../common/errors';
import { buildPaginationMeta, toPaginationArgs } from '../../common/pagination';
import type { PaginationMeta } from '../../common/pagination';
import type { RequestContext } from '../../common/types';
import type { Database } from '../../database/prisma';
import type { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';
import type { OrderRepository } from '../orders/order.repository';
import type { OrderService } from '../orders/order.service';
import type { PaymentRepository } from './payment.repository';
import { toPaymentDto } from './payment.mapper';
import type { PaymentDto } from './payment.types';
import type {
  ListPaymentsQueryInput,
  RejectPaymentInput,
  SubmitPaymentInput,
} from './payment.schemas';

export class PaymentService {
  constructor(
    private readonly db: Database,
    private readonly payments: PaymentRepository,
    private readonly orders: OrderRepository,
    private readonly orderService: OrderService,
    private readonly audit: AuditService,
    private readonly logger: FastifyBaseLogger,
  ) {}

  /** Restaurant submits an advance-payment proof for a PENDING_PAYMENT order. */
  async submit(orderId: string, input: SubmitPaymentInput, ctx: RequestContext): Promise<PaymentDto> {
    const restaurantId = requireRestaurantId(ctx);
    const order = await this.orders.findById(orderId);
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    if (order.restaurantId !== restaurantId) {
      throw new ForbiddenError('You can only pay for your own orders');
    }
    if (order.status !== 'PENDING_PAYMENT') {
      throw new ValidationError('This order is not awaiting payment');
    }
    if (await this.payments.hasOpenAdvance(orderId)) {
      throw new ValidationError('An advance payment is already submitted for this order');
    }

    const paymentId = await this.db.$transaction(async (tx) => {
      const payment = await this.payments.create(
        {
          orderId,
          paymentType: 'ADVANCE',
          amount: new Prisma.Decimal(order.advanceAmount),
          currency: order.currency,
          status: 'SUBMITTED',
          proofUrl: input.proofUrl,
          transactionReference: input.transactionReference ?? null,
          remarks: input.remarks ?? null,
          submittedBy: ctx.userId,
        },
        tx,
      );
      await this.orderService.markPaymentSubmitted(orderId, ctx, tx);
      await this.audit.record(
        {
          userId: ctx.userId,
          entityType: 'payment',
          entityId: payment.id,
          action: AUDIT_ACTIONS.ORDER_PAYMENT_SUBMITTED,
          newValue: { orderId, amount: order.advanceAmount.toFixed(2) },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        },
        tx,
      );
      return payment.id;
    });

    this.logger.info({ orderId, paymentId }, 'advance payment submitted');
    return this.requireDto(paymentId);
  }

  /** Administration verifies the advance and releases the order to review. */
  async verify(paymentId: string, ctx: RequestContext): Promise<PaymentDto> {
    const payment = await this.payments.findById(paymentId);
    if (!payment) {
      throw new NotFoundError('Payment not found');
    }
    if (payment.status !== 'SUBMITTED') {
      throw new ValidationError('Only submitted payments can be verified');
    }

    const now = new Date();
    await this.db.$transaction(async (tx) => {
      await this.payments.setStatus(
        paymentId,
        'VERIFIED',
        { verifiedBy: ctx.userId, verifiedAt: now, paidAt: now },
        tx,
      );
      await this.orderService.markPaymentVerified(payment.orderId, ctx, tx);
      await this.audit.record(
        {
          userId: ctx.userId,
          entityType: 'payment',
          entityId: paymentId,
          action: AUDIT_ACTIONS.ORDER_PAYMENT_VERIFIED,
          newValue: { orderId: payment.orderId },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        },
        tx,
      );
    });

    this.logger.info({ orderId: payment.orderId, paymentId }, 'advance payment verified');
    return this.requireDto(paymentId);
  }

  /** Administration rejects a payment proof; the order stays awaiting payment. */
  async reject(paymentId: string, input: RejectPaymentInput, ctx: RequestContext): Promise<PaymentDto> {
    const payment = await this.payments.findById(paymentId);
    if (!payment) {
      throw new NotFoundError('Payment not found');
    }
    if (payment.status !== 'SUBMITTED') {
      throw new ValidationError('Only submitted payments can be rejected');
    }

    const now = new Date();
    await this.db.$transaction(async (tx) => {
      await this.payments.setStatus(
        paymentId,
        'REJECTED',
        { verifiedBy: ctx.userId, verifiedAt: now, remarks: input.reason ?? null },
        tx,
      );
      await this.audit.record(
        {
          userId: ctx.userId,
          entityType: 'payment',
          entityId: paymentId,
          action: AUDIT_ACTIONS.ORDER_PAYMENT_REJECTED,
          newValue: { orderId: payment.orderId, reason: input.reason ?? null },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        },
        tx,
      );
    });

    return this.requireDto(paymentId);
  }

  async listForOrder(orderId: string, ctx: RequestContext): Promise<PaymentDto[]> {
    const order = await this.orders.findById(orderId);
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    if (!isPrivileged(ctx) && (!ctx.restaurantId || order.restaurantId !== ctx.restaurantId)) {
      throw new ForbiddenError('You do not have access to this order');
    }
    const payments = await this.payments.findByOrderId(orderId);
    return payments.map(toPaymentDto);
  }

  async list(
    query: ListPaymentsQueryInput,
    ctx: RequestContext,
  ): Promise<{ items: PaymentDto[]; pagination: PaginationMeta }> {
    const where: Prisma.PaymentWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.orderId) {
      where.orderId = query.orderId;
    }
    if (!isPrivileged(ctx)) {
      const restaurantId = requireRestaurantId(ctx);
      where.order = { restaurantId };
    }

    const { skip, take } = toPaginationArgs(query);
    const result = await this.payments.list({ skip, take, where });
    return {
      items: result.items.map(toPaymentDto),
      pagination: buildPaginationMeta(result.total, query),
    };
  }

  private async requireDto(id: string): Promise<PaymentDto> {
    const payment = await this.payments.findByIdWithOrder(id);
    if (!payment) {
      throw new InternalError('Payment not found after write');
    }
    return toPaymentDto(payment);
  }
}
