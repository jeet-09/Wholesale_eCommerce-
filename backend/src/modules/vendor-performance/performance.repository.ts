import type { Prisma, VendorPerformance } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { ListResult } from '../../common/types';
import type { PrismaExecutor } from '../../database/prisma';
import { performanceInclude } from './performance.types';
import type { PerformanceWithVendor } from './performance.types';

/**
 * Counters are updated transactionally as orders progress (assigned, accepted,
 * rejected, completed). `ensure` guarantees a row exists before incrementing.
 */
export class PerformanceRepository extends BaseRepository {
  findByVendorId(vendorId: string, tx?: PrismaExecutor): Promise<PerformanceWithVendor | null> {
    return this.exec(tx).vendorPerformance.findUnique({
      where: { vendorId },
      include: performanceInclude,
    });
  }

  /** Create the zeroed scorecard row if missing (idempotent). */
  async ensure(vendorId: string, tx?: PrismaExecutor): Promise<void> {
    await this.exec(tx).vendorPerformance.upsert({
      where: { vendorId },
      update: {},
      create: { vendorId },
    });
  }

  increment(
    vendorId: string,
    data: Prisma.VendorPerformanceUpdateInput,
    tx?: PrismaExecutor,
  ): Promise<VendorPerformance> {
    return this.exec(tx).vendorPerformance.update({
      where: { vendorId },
      data: { ...data, version: { increment: 1 } },
    });
  }

  async list(args: {
    skip: number;
    take: number;
    orderBy: Prisma.VendorPerformanceOrderByWithRelationInput;
  }): Promise<ListResult<PerformanceWithVendor>> {
    const [items, total] = await this.db.$transaction([
      this.db.vendorPerformance.findMany({
        skip: args.skip,
        take: args.take,
        orderBy: args.orderBy,
        include: performanceInclude,
      }),
      this.db.vendorPerformance.count(),
    ]);
    return { items, total };
  }
}
