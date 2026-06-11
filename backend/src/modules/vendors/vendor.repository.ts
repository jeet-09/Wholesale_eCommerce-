import type { Prisma, Vendor } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { ListResult } from '../../common/types';
import type { PrismaExecutor } from '../../database/prisma';
import type { CreateVendorData } from './vendor.types';

interface ListArgs {
  skip: number;
  take: number;
  where: Prisma.VendorWhereInput;
  orderBy: Prisma.VendorOrderByWithRelationInput[];
}

export class VendorRepository extends BaseRepository {
  findById(id: string, tx?: PrismaExecutor): Promise<Vendor | null> {
    return this.exec(tx).vendor.findFirst({ where: { id, ...this.notDeleted } });
  }

  findByOrganizationId(organizationId: string, tx?: PrismaExecutor): Promise<Vendor | null> {
    return this.exec(tx).vendor.findFirst({ where: { organizationId, ...this.notDeleted } });
  }

  findByCode(vendorCode: string, tx?: PrismaExecutor): Promise<Vendor | null> {
    return this.exec(tx).vendor.findFirst({ where: { vendorCode } });
  }

  create(data: CreateVendorData, tx?: PrismaExecutor): Promise<Vendor> {
    return this.exec(tx).vendor.create({
      data: {
        organizationId: data.organizationId,
        vendorName: data.vendorName,
        vendorCode: data.vendorCode,
        businessCategory: data.businessCategory ?? null,
        status: data.status ?? 'PENDING',
        createdBy: data.createdBy ?? null,
        updatedBy: data.createdBy ?? null,
      },
    });
  }

  update(id: string, data: Prisma.VendorUpdateInput, tx?: PrismaExecutor): Promise<Vendor> {
    return this.exec(tx).vendor.update({ where: { id }, data });
  }

  async list(args: ListArgs): Promise<ListResult<Vendor>> {
    const where: Prisma.VendorWhereInput = { ...args.where, ...this.notDeleted };
    const [items, total] = await this.db.$transaction([
      this.db.vendor.findMany({ where, skip: args.skip, take: args.take, orderBy: args.orderBy }),
      this.db.vendor.count({ where }),
    ]);
    return { items, total };
  }
}
