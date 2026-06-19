import type { Prisma, Vendor } from '@prisma/client';
import { OrganizationType } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

import { assertVendorAccess } from '../../common/authz';
import { DuplicateResourceError, InternalError, NotFoundError } from '../../common/errors';
import { buildPaginationMeta, parseSort, toPaginationArgs } from '../../common/pagination';
import type { PaginationMeta } from '../../common/pagination';
import type { RequestContext } from '../../common/types';
import { ROLES } from '../../common/types';
import type { Database } from '../../database/prisma';
import { generateVendorCode } from '../../utils/codes';
import type { PasswordHasher } from '../../utils/password';
import type { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';
import type { UserRepository } from '../users/user.repository';
import type { RoleRepository } from '../users/role.repository';
import type {
  OrganizationMemberRepository,
  OrganizationRepository,
} from '../organizations/organization.repository';
import type { VendorRepository } from './vendor.repository';
import { toVendorDto } from './vendor.mapper';
import type { VendorDto } from './vendor.types';
import type {
  CreateVendorAccountInput,
  ListVendorsQueryInput,
  UpdateVendorInput,
} from './vendor.schemas';

const SORTABLE_FIELDS = ['createdAt', 'vendorName', 'status'] as const;

export class VendorService {
  constructor(
    private readonly db: Database,
    private readonly vendors: VendorRepository,
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly organizations: OrganizationRepository,
    private readonly members: OrganizationMemberRepository,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuditService,
    private readonly logger: FastifyBaseLogger,
  ) {}

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

  /**
   * Admin onboarding: create the vendor organization, vendor profile, an owner
   * user with a login, the membership, and the VENDOR role binding — all in one
   * transaction. The new vendor is isolated to its own organization, so it only
   * ever sees orders that staff explicitly assign to it.
   */
  async createAccount(input: CreateVendorAccountInput, ctx: RequestContext): Promise<VendorDto> {
    if (await this.users.existsByEmail(input.email)) {
      throw new DuplicateResourceError('An account with this email already exists', [
        { field: 'email', message: 'Email is already in use' },
      ]);
    }

    const role = await this.roles.findByName(ROLES.VENDOR);
    if (!role) {
      throw new InternalError('Role "VENDOR" is not seeded');
    }

    const passwordHash = await this.hasher.hash(input.password);

    const vendor = await this.db.$transaction(async (tx) => {
      const user = await this.users.create(
        {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone ?? null,
          passwordHash,
          status: 'ACTIVE',
        },
        tx,
      );

      const organization = await this.organizations.create(
        {
          name: input.vendorName,
          organizationType: OrganizationType.VENDOR,
          email: input.email,
          phone: input.phone ?? null,
          createdBy: user.id,
        },
        tx,
      );
      await this.organizations.update(organization.id, { status: 'ACTIVE' }, tx);

      const created = await this.vendors.create(
        {
          organizationId: organization.id,
          vendorName: input.vendorName,
          vendorCode: generateVendorCode(),
          businessCategory: input.businessCategory ?? null,
          status: 'ACTIVE',
          createdBy: user.id,
        },
        tx,
      );

      await this.members.create(
        {
          organizationId: organization.id,
          userId: user.id,
          designation: 'Owner',
          status: 'ACTIVE',
          createdBy: user.id,
        },
        tx,
      );

      await this.roles.assignRoleToUser(
        { userId: user.id, roleId: role.id, organizationId: organization.id },
        tx,
      );

      await this.audit.record(
        {
          userId: ctx.userId,
          entityType: 'vendor',
          entityId: created.id,
          action: AUDIT_ACTIONS.VENDOR_CREATED,
          newValue: { vendorName: input.vendorName, email: input.email },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        },
        tx,
      );

      return created;
    });

    this.logger.info({ vendorId: vendor.id, by: ctx.userId }, 'vendor account created by admin');
    return toVendorDto(vendor);
  }

  private async ensureExists(id: string): Promise<Vendor> {
    const vendor = await this.vendors.findById(id);
    if (!vendor) {
      throw new NotFoundError('Vendor not found');
    }
    return vendor;
  }
}
