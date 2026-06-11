import { Prisma } from '@prisma/client';
import type { Order, OrderStatus } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { PrismaExecutor } from '../../database/prisma';
import { orderInclude } from './order.types';
import type { OrderWithRelations } from './order.types';

export class OrderRepository extends BaseRepository {
  async nextOrderNumber(tx?: PrismaExecutor): Promise<bigint> {
    const rows = await this.exec(tx).$queryRaw<Array<{ nextval: bigint }>>(
      Prisma.sql`SELECT nextval('order_number_seq') AS nextval`,
    );
    return rows[0]?.nextval ?? 0n;
  }

  create(data: Prisma.OrderCreateInput, tx?: PrismaExecutor): Promise<Order> {
    return this.exec(tx).order.create({ data });
  }

  createItems(items: Prisma.OrderItemCreateManyInput[], tx?: PrismaExecutor): Promise<Prisma.BatchPayload> {
    return this.exec(tx).orderItem.createMany({ data: items });
  }

  appendStatus(
    input: {
      orderId: string;
      oldStatus: OrderStatus | null;
      newStatus: OrderStatus;
      changedBy: string | null;
      remarks?: string | null;
    },
    tx?: PrismaExecutor,
  ): Promise<unknown> {
    return this.exec(tx).orderStatusHistory.create({
      data: {
        orderId: input.orderId,
        oldStatus: input.oldStatus,
        newStatus: input.newStatus,
        changedBy: input.changedBy,
        remarks: input.remarks ?? null,
      },
    });
  }

  findById(id: string, tx?: PrismaExecutor): Promise<Order | null> {
    return this.exec(tx).order.findFirst({ where: { id, ...this.notDeleted } });
  }

  findByIdWithRelations(id: string, tx?: PrismaExecutor): Promise<OrderWithRelations | null> {
    return this.exec(tx).order.findFirst({
      where: { id, ...this.notDeleted },
      include: orderInclude,
    });
  }

  updateStatusFields(
    id: string,
    data: Prisma.OrderUpdateInput,
    tx?: PrismaExecutor,
  ): Promise<Order> {
    return this.exec(tx).order.update({ where: { id }, data });
  }

  async list(args: {
    skip: number;
    take: number;
    where: Prisma.OrderWhereInput;
    orderBy: Prisma.OrderOrderByWithRelationInput[];
  }): Promise<{ items: OrderWithRelations[]; total: number }> {
    const where: Prisma.OrderWhereInput = { ...args.where, ...this.notDeleted };
    const [items, total] = await Promise.all([
      this.db.order.findMany({
        where,
        include: orderInclude,
        orderBy: args.orderBy,
        skip: args.skip,
        take: args.take,
      }),
      this.db.order.count({ where }),
    ]);
    return { items, total };
  }
}
