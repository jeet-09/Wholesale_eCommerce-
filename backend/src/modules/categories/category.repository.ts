import type { Category, Prisma } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { ListResult } from '../../common/types';
import type { PrismaExecutor } from '../../database/prisma';

interface ListArgs {
  skip: number;
  take: number;
  where: Prisma.CategoryWhereInput;
  orderBy: Prisma.CategoryOrderByWithRelationInput[];
}

export class CategoryRepository extends BaseRepository {
  findById(id: string, tx?: PrismaExecutor): Promise<Category | null> {
    return this.exec(tx).category.findFirst({ where: { id, ...this.notDeleted } });
  }

  findBySlug(slug: string, tx?: PrismaExecutor): Promise<Category | null> {
    return this.exec(tx).category.findFirst({ where: { slug, ...this.notDeleted } });
  }

  create(data: Prisma.CategoryUncheckedCreateInput, tx?: PrismaExecutor): Promise<Category> {
    return this.exec(tx).category.create({ data });
  }

  update(id: string, data: Prisma.CategoryUncheckedUpdateInput, tx?: PrismaExecutor): Promise<Category> {
    return this.exec(tx).category.update({ where: { id }, data });
  }

  softDelete(id: string, deletedBy: string, tx?: PrismaExecutor): Promise<Category> {
    return this.exec(tx).category.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: deletedBy },
    });
  }

  async countChildren(id: string, tx?: PrismaExecutor): Promise<number> {
    return this.exec(tx).category.count({ where: { parentCategoryId: id, ...this.notDeleted } });
  }

  async list(args: ListArgs): Promise<ListResult<Category>> {
    const where: Prisma.CategoryWhereInput = { ...args.where, ...this.notDeleted };
    const [items, total] = await this.db.$transaction([
      this.db.category.findMany({ where, skip: args.skip, take: args.take, orderBy: args.orderBy }),
      this.db.category.count({ where }),
    ]);
    return { items, total };
  }
}
