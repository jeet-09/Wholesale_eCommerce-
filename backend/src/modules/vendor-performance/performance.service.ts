import { assertVendorAccess, isPrivileged } from '../../common/authz';
import { NotFoundError } from '../../common/errors';
import { buildPaginationMeta, parseSort, toPaginationArgs } from '../../common/pagination';
import type { PaginationMeta } from '../../common/pagination';
import type { RequestContext } from '../../common/types';
import type { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';
import type { VendorRepository } from '../vendors/vendor.repository';
import type { PerformanceRepository } from './performance.repository';
import { emptyPerformanceDto, toPerformanceDto } from './performance.mapper';
import type { PerformanceDto } from './performance.types';
import type { RateVendorInput } from './performance.schemas';

const SORTABLE_FIELDS = ['totalCompleted', 'totalAssigned', 'createdAt'] as const;

export class PerformanceService {
  constructor(
    private readonly performance: PerformanceRepository,
    private readonly vendors: VendorRepository,
    private readonly audit: AuditService,
  ) {}

  async getForVendor(vendorId: string, ctx: RequestContext): Promise<PerformanceDto> {
    if (!isPrivileged(ctx)) {
      assertVendorAccess(ctx, vendorId);
    }
    const vendor = await this.vendors.findById(vendorId);
    if (!vendor) {
      throw new NotFoundError('Vendor not found');
    }
    const row = await this.performance.findByVendorId(vendorId);
    return row ? toPerformanceDto(row) : emptyPerformanceDto(vendorId, vendor.vendorName);
  }

  async list(
    query: { page: number; pageSize: number; sort?: string },
    _ctx: RequestContext,
  ): Promise<{ items: PerformanceDto[]; pagination: PaginationMeta }> {
    const fallback = { field: 'totalCompleted', direction: 'desc' as const };
    const sort = parseSort(query.sort, SORTABLE_FIELDS, fallback)[0] ?? fallback;
    const { skip, take } = toPaginationArgs(query);
    const result = await this.performance.list({
      skip,
      take,
      orderBy: { [sort.field]: sort.direction },
    });
    return {
      items: result.items.map(toPerformanceDto),
      pagination: buildPaginationMeta(result.total, query),
    };
  }

  /** Administration/Admin records a manual rating for a vendor. */
  async rate(vendorId: string, input: RateVendorInput, ctx: RequestContext): Promise<PerformanceDto> {
    const vendor = await this.vendors.findById(vendorId);
    if (!vendor) {
      throw new NotFoundError('Vendor not found');
    }
    await this.performance.ensure(vendorId);
    await this.performance.increment(vendorId, {
      ratingSum: { increment: input.rating },
      ratingCount: { increment: 1 },
    });
    await this.audit.record({
      userId: ctx.userId,
      entityType: 'vendor',
      entityId: vendorId,
      action: AUDIT_ACTIONS.VENDOR_RATED,
      newValue: { rating: input.rating, remarks: input.remarks ?? null },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    const row = await this.performance.findByVendorId(vendorId);
    return row ? toPerformanceDto(row) : emptyPerformanceDto(vendorId, vendor.vendorName);
  }
}
