import type {
  Organization,
  OrganizationAddress,
  OrganizationMember,
  Prisma,
} from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { ListResult } from '../../common/types';
import type { PrismaExecutor } from '../../database/prisma';
import type { CreateOrganizationData } from './organization.types';

interface OrgListArgs {
  skip: number;
  take: number;
  where: Prisma.OrganizationWhereInput;
  orderBy: Prisma.OrganizationOrderByWithRelationInput[];
}

export class OrganizationRepository extends BaseRepository {
  findById(id: string, tx?: PrismaExecutor): Promise<Organization | null> {
    return this.exec(tx).organization.findFirst({ where: { id, ...this.notDeleted } });
  }

  create(data: CreateOrganizationData, tx?: PrismaExecutor): Promise<Organization> {
    return this.exec(tx).organization.create({
      data: {
        name: data.name,
        organizationType: data.organizationType,
        gstNumber: data.gstNumber ?? null,
        panNumber: data.panNumber ?? null,
        email: data.email ?? null,
        phone: data.phone ?? null,
        website: data.website ?? null,
        createdBy: data.createdBy ?? null,
        updatedBy: data.createdBy ?? null,
      },
    });
  }

  update(
    id: string,
    data: Prisma.OrganizationUpdateInput,
    tx?: PrismaExecutor,
  ): Promise<Organization> {
    return this.exec(tx).organization.update({ where: { id }, data });
  }

  async list(args: OrgListArgs): Promise<ListResult<Organization>> {
    const where: Prisma.OrganizationWhereInput = { ...args.where, ...this.notDeleted };
    const [items, total] = await this.db.$transaction([
      this.db.organization.findMany({
        where,
        skip: args.skip,
        take: args.take,
        orderBy: args.orderBy,
      }),
      this.db.organization.count({ where }),
    ]);
    return { items, total };
  }
}

export class OrganizationMemberRepository extends BaseRepository {
  create(
    input: {
      organizationId: string;
      userId: string;
      designation?: string | null;
      status?: Prisma.OrganizationMemberCreateInput['status'];
      createdBy?: string | null;
    },
    tx?: PrismaExecutor,
  ): Promise<OrganizationMember> {
    return this.exec(tx).organizationMember.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        designation: input.designation ?? null,
        status: input.status ?? 'INVITED',
        joinedAt: input.status === 'ACTIVE' ? new Date() : null,
        createdBy: input.createdBy ?? null,
        updatedBy: input.createdBy ?? null,
      },
    });
  }

  findActive(
    organizationId: string,
    userId: string,
    tx?: PrismaExecutor,
  ): Promise<OrganizationMember | null> {
    return this.exec(tx).organizationMember.findFirst({
      where: { organizationId, userId, ...this.notDeleted },
    });
  }

  listByOrganization(organizationId: string, tx?: PrismaExecutor): Promise<OrganizationMember[]> {
    return this.exec(tx).organizationMember.findMany({
      where: { organizationId, ...this.notDeleted },
      orderBy: { createdAt: 'asc' },
    });
  }
}

export class OrganizationAddressRepository extends BaseRepository {
  create(
    data: Prisma.OrganizationAddressUncheckedCreateInput,
    tx?: PrismaExecutor,
  ): Promise<OrganizationAddress> {
    return this.exec(tx).organizationAddress.create({ data });
  }

  listByOrganization(organizationId: string, tx?: PrismaExecutor): Promise<OrganizationAddress[]> {
    return this.exec(tx).organizationAddress.findMany({
      where: { organizationId, ...this.notDeleted },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Clear the primary flag for other addresses of the same type (one primary). */
  async clearPrimary(
    organizationId: string,
    addressType: OrganizationAddress['addressType'],
    tx?: PrismaExecutor,
  ): Promise<void> {
    await this.exec(tx).organizationAddress.updateMany({
      where: { organizationId, addressType, isPrimary: true, ...this.notDeleted },
      data: { isPrimary: false },
    });
  }
}
