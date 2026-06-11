import type { Prisma, Vendor } from '@prisma/client';

import { assertVendorAccess } from '../../common/authz';
import { NotFoundError } from '../../common/errors';
import { buildPaginationMeta, parseSort, toPaginationArgs } from '../../common/pagination';
import type { PaginationMeta } from '../../common/pagination';
import type { RequestContext } from '../../common/types';
import type { VendorRepository } from './vendor.repository';
import { toVendorDto } from './vendor.mapper';
import type { VendorDto } from './vendor.types';
import type { ListVendorsQueryInput, UpdateVendorInput } from './vendor.schemas';

const SORTABLE_FIELDS = ['createdAt', 'vendorName', 'status'] as const;

export class VendorService {
  constructor(private readonly vendors: VendorRepository) {}

  async getById(id: string): Promise<VendorDto> {
    return toVendorDto(await this.ensureExists(id));
  }

  async list(
    query: ListVendorsQueryInput,
  ): Promise<{ items: VendorDto[]; pagination: PaginationMeta }> {
    const where: Prisma.VendorWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      where.vendorName = { contains: query.search, mode: 'insensitive' };
    }

    const orderBy = parseSort(query.sort, SORTABLE_FIELDS).map((sort) => ({
      [sort.field]: sort.direction,
    })) as Prisma.VendorOrderByWithRelationInput[];

    const { skip, take } = toPaginationArgs(query);
    const result = await this.vendors.list({ skip, take, where, orderBy });
    return {
      items: result.items.map(toVendorDto),
      pagination: buildPaginationMeta(result.total, query),
    };
  }

  async update(id: string, input: UpdateVendorInput, ctx: RequestContext): Promise<VendorDto> {
    await this.ensureExists(id);
    assertVendorAccess(ctx, id);
    const updated = await this.vendors.update(id, { ...input, updatedBy: ctx.userId });
    return toVendorDto(updated);
  }

  private async ensureExists(id: string): Promise<Vendor> {
    const vendor = await this.vendors.findById(id);
    if (!vendor) {
      throw new NotFoundError('Vendor not found');
    }
    return vendor;
  }
}
