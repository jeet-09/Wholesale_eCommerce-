import type { Prisma, AuditLog } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

import type { ListResult } from '../../common/types';
import { buildPaginationMeta, toPaginationArgs } from '../../common/pagination';
import type { PaginationMeta } from '../../common/pagination';
import type { PrismaExecutor } from '../../database/prisma';
import type { AuditRepository } from './audit.repository';
import type { AuditEntryInput, AuditLogDto } from './audit.types';

export interface AuditListQuery {
  page: number;
  pageSize: number;
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: string;
}

function toDto(entity: AuditLog): AuditLogDto {
  return {
    id: entity.id,
    userId: entity.userId,
    entityType: entity.entityType,
    entityId: entity.entityId,
    action: entity.action,
    oldValue: entity.oldValue ?? null,
    newValue: entity.newValue ?? null,
    ipAddress: entity.ipAddress,
    userAgent: entity.userAgent,
    requestId: entity.requestId,
    createdAt: entity.createdAt.toISOString(),
  };
}

export class AuditService {
  constructor(
    private readonly repository: AuditRepository,
    private readonly logger: FastifyBaseLogger,
  ) {}

  /**
   * Append an audit entry. When a transaction client is supplied the write is
   * part of the surrounding atomic operation; otherwise it is best-effort and
   * a failure is logged but never breaks the caller's primary flow.
   */
  async record(input: AuditEntryInput, tx?: PrismaExecutor): Promise<void> {
    if (tx) {
      await this.repository.create(input, tx);
      return;
    }
    try {
      await this.repository.create(input);
    } catch (error) {
      this.logger.error({ err: error, action: input.action }, 'failed to write audit log');
    }
  }

  async list(query: AuditListQuery): Promise<{ items: AuditLogDto[]; pagination: PaginationMeta }> {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.entityType) {
      where.entityType = query.entityType;
    }
    if (query.entityId) {
      where.entityId = query.entityId;
    }
    if (query.userId) {
      where.userId = query.userId;
    }
    if (query.action) {
      where.action = query.action;
    }

    const { skip, take } = toPaginationArgs(query);
    const result: ListResult<AuditLog> = await this.repository.list({ skip, take, where });
    return {
      items: result.items.map(toDto),
      pagination: buildPaginationMeta(result.total, query),
    };
  }
}
