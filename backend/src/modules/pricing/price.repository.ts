import type { Prisma } from '@prisma/client';
import type { ProductPrice } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import { DEFAULT_CURRENCY } from '../../common/constants';
import type { ListResult } from '../../common/types';
import type { PrismaExecutor } from '../../database/prisma';

interface CreatePriceInput {
  productId: string;
  price: Prisma.Decimal | number | string;
  currency?: string;
  effectiveFrom?: Date;
  createdBy?: string | null;
}

/**
 * Append-only price history (DATABASE.md Rule 6). Prices are NEVER mutated; a
 * change closes the current row and inserts a new one inside one transaction.
 */
export class ProductPriceRepository extends BaseRepository {
  findCurrent(productId: string, tx?: PrismaExecutor): Promise<ProductPrice | null> {
    return this.exec(tx).productPrice.findFirst({ where: { productId, isCurrent: true } });
  }

  findManyCurrent(productIds: string[], tx?: PrismaExecutor): Promise<ProductPrice[]> {
    return this.exec(tx).productPrice.findMany({
      where: { productId: { in: productIds }, isCurrent: true },
    });
  }

  /** Close the open price row (effective_to = now, is_current = false). */
  async closeCurrent(productId: string, when: Date, tx?: PrismaExecutor): Promise<void> {
    await this.exec(tx).productPrice.updateMany({
      where: { productId, isCurrent: true },
      data: { isCurrent: false, effectiveTo: when },
    });
  }

  create(input: CreatePriceInput, tx?: PrismaExecutor): Promise<ProductPrice> {
    return this.exec(tx).productPrice.create({
      data: {
        productId: input.productId,
        price: input.price,
        currency: input.currency ?? DEFAULT_CURRENCY,
        effectiveFrom: input.effectiveFrom ?? new Date(),
        isCurrent: true,
        createdBy: input.createdBy ?? null,
      },
    });
  }

  async listByProduct(
    productId: string,
    args: { skip: number; take: number },
    tx?: PrismaExecutor,
  ): Promise<ListResult<ProductPrice>> {
    const where: Prisma.ProductPriceWhereInput = { productId };
    const executor = this.exec(tx);
    const [items, total] = await Promise.all([
      executor.productPrice.findMany({
        where,
        skip: args.skip,
        take: args.take,
        orderBy: { effectiveFrom: 'desc' },
      }),
      executor.productPrice.count({ where }),
    ]);
    return { items, total };
  }
}
