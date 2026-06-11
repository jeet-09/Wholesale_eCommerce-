import type { Prisma, Product } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { ListResult } from '../../common/types';
import type { PrismaExecutor } from '../../database/prisma';
import { productInclude } from './product.types';
import type { ProductWithRelations } from './product.types';

interface ListArgs {
  skip: number;
  take: number;
  where: Prisma.ProductWhereInput;
  orderBy: Prisma.ProductOrderByWithRelationInput[];
}

export class ProductRepository extends BaseRepository {
  findById(id: string, tx?: PrismaExecutor): Promise<Product | null> {
    return this.exec(tx).product.findFirst({ where: { id, ...this.notDeleted } });
  }

  findByIdWithRelations(id: string, tx?: PrismaExecutor): Promise<ProductWithRelations | null> {
    return this.exec(tx).product.findFirst({
      where: { id, ...this.notDeleted },
      include: productInclude,
    });
  }

  async existsSkuForVendor(vendorId: string, sku: string, tx?: PrismaExecutor): Promise<boolean> {
    const found = await this.exec(tx).product.findFirst({
      where: { vendorId, sku, ...this.notDeleted },
      select: { id: true },
    });
    return found !== null;
  }

  create(data: Prisma.ProductUncheckedCreateInput, tx?: PrismaExecutor): Promise<Product> {
    return this.exec(tx).product.create({ data });
  }

  update(id: string, data: Prisma.ProductUpdateInput, tx?: PrismaExecutor): Promise<Product> {
    return this.exec(tx).product.update({ where: { id }, data });
  }

  softDelete(id: string, deletedBy: string, tx?: PrismaExecutor): Promise<Product> {
    return this.exec(tx).product.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy, status: 'ARCHIVED' },
    });
  }

  async list(args: ListArgs): Promise<ListResult<ProductWithRelations>> {
    const where: Prisma.ProductWhereInput = { ...args.where, ...this.notDeleted };
    const [items, total] = await this.db.$transaction([
      this.db.product.findMany({
        where,
        skip: args.skip,
        take: args.take,
        orderBy: args.orderBy,
        include: productInclude,
      }),
      this.db.product.count({ where }),
    ]);
    return { items, total };
  }
}
