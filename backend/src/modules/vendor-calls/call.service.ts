import type { Prisma } from '@prisma/client';

import { NotFoundError } from '../../common/errors';
import { buildPaginationMeta, toPaginationArgs } from '../../common/pagination';
import type { PaginationMeta } from '../../common/pagination';
import type { RequestContext } from '../../common/types';
import type { Database } from '../../database/prisma';
import type { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';
import type { OrderRepository } from '../orders/order.repository';
import type { VendorRepository } from '../vendors/vendor.repository';
import type { PerformanceRepository } from '../vendor-performance/performance.repository';
import type { CallRepository } from './call.repository';
import { toCallDto } from './call.mapper';
import type { CallDto } from './call.types';
import type { ListCallsQueryInput, LogCallInput } from './call.schemas';

export class CallService {
  constructor(
    private readonly db: Database,
    private readonly calls: CallRepository,
    private readonly orders: OrderRepository,
    private readonly vendors: VendorRepository,
    private readonly performance: PerformanceRepository,
    private readonly audit: AuditService,
  ) {}

  /** Administration records the outcome of a call to a vendor about an order. */
  async log(orderId: string, input: LogCallInput, ctx: RequestContext): Promise<CallDto> {
    const order = await this.orders.findById(orderId);
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    const vendor = await this.vendors.findById(input.vendorId);
    if (!vendor) {
      throw new NotFoundError('Vendor not found');
    }

    const call = await this.db.$transaction(async (tx) => {
      const created = await this.calls.create(
        {
          orderId,
          vendorId: input.vendorId,
          calledBy: ctx.userId,
          outcome: input.outcome,
          remarks: input.remarks ?? null,
        },
        tx,
      );
      if (input.outcome === 'NO_RESPONSE') {
        await this.performance.ensure(input.vendorId, tx);
        await this.performance.increment(
          input.vendorId,
          { totalNoResponse: { increment: 1 } },
          tx,
        );
      }
      await this.audit.record(
        {
          userId: ctx.userId,
          entityType: 'vendor_call',
          entityId: created.id,
          action: AUDIT_ACTIONS.VENDOR_CALL_LOGGED,
          newValue: { orderId, vendorId: input.vendorId, outcome: input.outcome },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        },
        tx,
      );
      return created;
    });

    return toCallDto(call);
  }

  async listForOrder(orderId: string): Promise<CallDto[]> {
    const order = await this.orders.findById(orderId);
    if (!order) {
      throw new NotFoundError('Order not found');
    }
    const calls = await this.calls.findByOrderId(orderId);
    return calls.map(toCallDto);
  }

  async list(
    query: ListCallsQueryInput,
  ): Promise<{ items: CallDto[]; pagination: PaginationMeta }> {
    const where: Prisma.VendorCallLogWhereInput = {};
    if (query.vendorId) {
      where.vendorId = query.vendorId;
    }
    if (query.outcome) {
      where.outcome = query.outcome;
    }
    const { skip, take } = toPaginationArgs(query);
    const result = await this.calls.list({ skip, take, where });
    return {
      items: result.items.map(toCallDto),
      pagination: buildPaginationMeta(result.total, query),
    };
  }
}
