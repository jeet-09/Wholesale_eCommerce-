import type { Prisma, AuditLog } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { ListResult } from '../../common/types';
import type { PrismaExecutor } from '../../database/prisma';
import type { AuditEntryInput } from './audit.types';

interface ListArgs {
  skip: number;
  take: number;
  where: Prisma.AuditLogWhereInput;
}

export class AuditRepository extends BaseRepository {
  async create(input: AuditEntryInput, tx?: PrismaExecutor): Promise<AuditLog> {
    return this.exec(tx).auditLog.create({
      data: {
        userId: input.userId,
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
        oldValue: (input.oldValue ?? undefined),
        newValue: (input.newValue ?? undefined),
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        requestId: input.requestId ?? null,
      },
    });
  }

  async list(args: ListArgs): Promise<ListResult<AuditLog>> {
    const [items, total] = await this.db.$transaction([
      this.db.auditLog.findMany({
        where: args.where,
        skip: args.skip,
        take: args.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.db.auditLog.count({ where: args.where }),
    ]);
    return { items, total };
  }
}
