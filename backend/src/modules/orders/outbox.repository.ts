import type { Prisma } from '@prisma/client';
import type { OutboxEvent } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { PrismaExecutor } from '../../database/prisma';

/**
 * Transactional outbox (DATABASE.md). Events are written in the SAME
 * transaction as the state change that produced them, then relayed
 * asynchronously by a worker. This guarantees at-least-once delivery without
 * dual-write inconsistencies.
 */
export class OutboxRepository extends BaseRepository {
  enqueue(
    input: {
      aggregateType: string;
      aggregateId: string;
      eventType: string;
      payload: Prisma.InputJsonValue;
    },
    tx?: PrismaExecutor,
  ): Promise<OutboxEvent> {
    return this.exec(tx).outboxEvent.create({
      data: {
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        payload: input.payload,
      },
    });
  }
}
