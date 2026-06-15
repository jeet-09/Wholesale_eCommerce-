import type { Payment, PaymentStatus, Prisma } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { ListResult } from '../../common/types';
import type { PrismaExecutor } from '../../database/prisma';
import { paymentInclude } from './payment.types';
import type { PaymentWithOrder } from './payment.types';

interface ListArgs {
  skip: number;
  take: number;
  where: Prisma.PaymentWhereInput;
}

export class PaymentRepository extends BaseRepository {
  findById(id: string, tx?: PrismaExecutor): Promise<Payment | null> {
    return this.exec(tx).payment.findFirst({ where: { id, ...this.notDeleted } });
  }

  findByIdWithOrder(id: string, tx?: PrismaExecutor): Promise<PaymentWithOrder | null> {
    return this.exec(tx).payment.findFirst({
      where: { id, ...this.notDeleted },
      include: paymentInclude,
    });
  }

  findByOrderId(orderId: string, tx?: PrismaExecutor): Promise<PaymentWithOrder[]> {
    return this.exec(tx).payment.findMany({
      where: { orderId, ...this.notDeleted },
      include: paymentInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** True if an advance payment is already pending verification or verified. */
  async hasOpenAdvance(orderId: string, tx?: PrismaExecutor): Promise<boolean> {
    const count = await this.exec(tx).payment.count({
      where: {
        orderId,
        paymentType: 'ADVANCE',
        status: { in: ['SUBMITTED', 'VERIFIED'] },
        ...this.notDeleted,
      },
    });
    return count > 0;
  }

  create(data: Prisma.PaymentUncheckedCreateInput, tx?: PrismaExecutor): Promise<Payment> {
    return this.exec(tx).payment.create({ data });
  }

  update(id: string, data: Prisma.PaymentUpdateInput, tx?: PrismaExecutor): Promise<Payment> {
    return this.exec(tx).payment.update({ where: { id }, data });
  }

  async list(args: ListArgs): Promise<ListResult<PaymentWithOrder>> {
    const where: Prisma.PaymentWhereInput = { ...args.where, ...this.notDeleted };
    const [items, total] = await this.db.$transaction([
      this.db.payment.findMany({
        where,
        skip: args.skip,
        take: args.take,
        orderBy: { createdAt: 'desc' },
        include: paymentInclude,
      }),
      this.db.payment.count({ where }),
    ]);
    return { items, total };
  }

  setStatus(
    id: string,
    status: PaymentStatus,
    data: Prisma.PaymentUpdateInput,
    tx?: PrismaExecutor,
  ): Promise<Payment> {
    return this.exec(tx).payment.update({ where: { id }, data: { ...data, status } });
  }
}
