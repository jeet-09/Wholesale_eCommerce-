import { Prisma } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { IdempotencyRecord, IdempotencyStore } from '../../middleware/idempotency';

/**
 * Concrete idempotency store backed by the `idempotency_keys` table
 * (DATABASE.md). Wired into the idempotency middleware at the composition root.
 */
export class IdempotencyRepository extends BaseRepository implements IdempotencyStore {
  async find(userId: string, key: string): Promise<IdempotencyRecord | null> {
    const record = await this.db.idempotencyKey.findUnique({
      where: { userId_key: { userId, key } },
    });
    if (!record) {
      return null;
    }
    return {
      id: record.id,
      status: record.status,
      requestHash: record.requestHash,
      responseStatus: record.responseStatus,
      responseBody: record.responseBody ?? null,
    };
  }

  async create(input: {
    userId: string;
    key: string;
    endpoint: string;
    requestHash: string;
    expiresAt: Date;
  }): Promise<IdempotencyRecord> {
    const record = await this.db.idempotencyKey.create({
      data: {
        userId: input.userId,
        key: input.key,
        endpoint: input.endpoint,
        requestHash: input.requestHash,
        expiresAt: input.expiresAt,
        status: 'IN_PROGRESS',
      },
    });
    return {
      id: record.id,
      status: record.status,
      requestHash: record.requestHash,
      responseStatus: record.responseStatus,
      responseBody: record.responseBody ?? null,
    };
  }

  async complete(id: string, responseStatus: number, responseBody: unknown): Promise<void> {
    await this.db.idempotencyKey.update({
      where: { id },
      data: {
        status: 'COMPLETED',
        responseStatus,
        responseBody: (responseBody ?? Prisma.JsonNull),
      },
    });
  }

  async delete(id: string): Promise<void> {
    await this.db.idempotencyKey.delete({ where: { id } });
  }
}
