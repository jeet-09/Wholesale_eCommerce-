import { Prisma } from '@prisma/client';
import type { Inventory } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { PrismaExecutor } from '../../database/prisma';

interface CreateInventoryInput {
  productId: string;
  availableQuantity?: Prisma.Decimal | number | string;
  reservedQuantity?: Prisma.Decimal | number | string;
  minimumQuantity?: Prisma.Decimal | number | string;
  maximumQuantity?: Prisma.Decimal | number | string | null;
}

/**
 * Inventory persistence. Stock mutations use OPTIMISTIC LOCKING on `version`
 * (DATABASE.md C7): a guarded updateMany returns 0 rows on a concurrent change,
 * which the service treats as a conflict and the transaction rolls back.
 */
export class InventoryRepository extends BaseRepository {
  findByProductId(productId: string, tx?: PrismaExecutor): Promise<Inventory | null> {
    return this.exec(tx).inventory.findFirst({ where: { productId, ...this.notDeleted } });
  }

  create(input: CreateInventoryInput, tx?: PrismaExecutor): Promise<Inventory> {
    return this.exec(tx).inventory.create({
      data: {
        productId: input.productId,
        availableQuantity: input.availableQuantity ?? 0,
        reservedQuantity: input.reservedQuantity ?? 0,
        minimumQuantity: input.minimumQuantity ?? 0,
        maximumQuantity: input.maximumQuantity ?? null,
      },
    });
  }

  /** Reserve stock when an order is placed. Returns false on version conflict. */
  async reserve(inventory: Inventory, quantity: Prisma.Decimal, tx?: PrismaExecutor): Promise<boolean> {
    const newReserved = inventory.reservedQuantity.plus(quantity);
    const result = await this.exec(tx).inventory.updateMany({
      where: { id: inventory.id, version: inventory.version },
      data: { reservedQuantity: newReserved, version: { increment: 1 } },
    });
    return result.count === 1;
  }

  /** Release a reservation when an order is cancelled/rejected. */
  async release(inventory: Inventory, quantity: Prisma.Decimal, tx?: PrismaExecutor): Promise<boolean> {
    const next = inventory.reservedQuantity.minus(quantity);
    const newReserved = next.isNegative() ? new Prisma.Decimal(0) : next;
    const result = await this.exec(tx).inventory.updateMany({
      where: { id: inventory.id, version: inventory.version },
      data: { reservedQuantity: newReserved, version: { increment: 1 } },
    });
    return result.count === 1;
  }

  /** Fulfil on delivery: decrement both available and reserved. */
  async fulfil(inventory: Inventory, quantity: Prisma.Decimal, tx?: PrismaExecutor): Promise<boolean> {
    const newAvailable = inventory.availableQuantity.minus(quantity);
    const reservedNext = inventory.reservedQuantity.minus(quantity);
    const newReserved = reservedNext.isNegative() ? new Prisma.Decimal(0) : reservedNext;
    const result = await this.exec(tx).inventory.updateMany({
      where: { id: inventory.id, version: inventory.version },
      data: { availableQuantity: newAvailable, reservedQuantity: newReserved, version: { increment: 1 } },
    });
    return result.count === 1;
  }

  /** Admin stock adjustment (not high-concurrency). */
  update(id: string, data: Prisma.InventoryUpdateInput, tx?: PrismaExecutor): Promise<Inventory> {
    return this.exec(tx).inventory.update({
      where: { id },
      data: { ...data, version: { increment: 1 } },
    });
  }
}
