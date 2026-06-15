import type { Prisma } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { ListResult } from '../../common/types';
import type { PrismaExecutor } from '../../database/prisma';
import { callInclude } from './call.types';
import type { CallWithRelations } from './call.types';

interface ListArgs {
  skip: number;
  take: number;
  where: Prisma.VendorCallLogWhereInput;
}

export class CallRepository extends BaseRepository {
  create(
    data: Prisma.VendorCallLogUncheckedCreateInput,
    tx?: PrismaExecutor,
  ): Promise<CallWithRelations> {
    return this.exec(tx).vendorCallLog.create({ data, include: callInclude });
  }

  findByOrderId(orderId: string, tx?: PrismaExecutor): Promise<CallWithRelations[]> {
    return this.exec(tx).vendorCallLog.findMany({
      where: { orderId },
      include: callInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async list(args: ListArgs): Promise<ListResult<CallWithRelations>> {
    const [items, total] = await this.db.$transaction([
      this.db.vendorCallLog.findMany({
        where: args.where,
        skip: args.skip,
        take: args.take,
        orderBy: { createdAt: 'desc' },
        include: callInclude,
      }),
      this.db.vendorCallLog.count({ where: args.where }),
    ]);
    return { items, total };
  }
}
