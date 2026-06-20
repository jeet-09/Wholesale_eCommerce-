import type { Organization, Prisma } from '@prisma/client';

import { ConflictError, NotFoundError } from '../../common/errors';
import { buildPaginationMeta, parseSort, toPaginationArgs } from '../../common/pagination';
import type { PaginationMeta } from '../../common/pagination';
import type { RequestContext } from '../../common/types';
import type { AuthContextInvalidator } from '../../middleware/auth';
import type { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';
import type { UserRepository } from '../users/user.repository';
import type {
  OrganizationAddressRepository,
  OrganizationMemberRepository,
  OrganizationRepository,
} from './organization.repository';
import { toAddressDto, toMemberDto, toOrganizationDto } from './organization.mapper';
import type { AddressDto, MemberDto, OrganizationDto } from './organization.types';
import type {
  AddAddressInput,
  AddMemberInput,
  ListOrganizationsQueryInput,
  UpdateOrganizationInput,
} from './organization.schemas';

const SORTABLE_FIELDS = ['createdAt', 'name', 'status'] as const;

export class OrganizationService {
  constructor(
    private readonly organizations: OrganizationRepository,
    private readonly members: OrganizationMemberRepository,
    private readonly addresses: OrganizationAddressRepository,
    private readonly users: UserRepository,
    private readonly audit: AuditService,
    private readonly authContext: AuthContextInvalidator,
  ) {}

  async getById(id: string): Promise<OrganizationDto> {
    return toOrganizationDto(await this.ensureExists(id));
  }

  async list(
    query: ListOrganizationsQueryInput,
  ): Promise<{ items: OrganizationDto[]; pagination: PaginationMeta }> {
    const where: Prisma.OrganizationWhereInput = {};
    if (query.organizationType) {
      where.organizationType = query.organizationType;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.search) {
      where.name = { contains: query.search, mode: 'insensitive' };
    }

    const orderBy = parseSort(query.sort, SORTABLE_FIELDS).map((sort) => ({
      [sort.field]: sort.direction,
    })) as Prisma.OrganizationOrderByWithRelationInput[];

    const { skip, take } = toPaginationArgs(query);
    const result = await this.organizations.list({ skip, take, where, orderBy });
    return {
      items: result.items.map(toOrganizationDto),
      pagination: buildPaginationMeta(result.total, query),
    };
  }

  async update(
    id: string,
    input: UpdateOrganizationInput,
    ctx: RequestContext,
  ): Promise<OrganizationDto> {
    await this.ensureExists(id);
    const updated = await this.organizations.update(id, {
      ...input,
      updatedBy: ctx.userId,
    });
    await this.audit.record({
      userId: ctx.userId,
      entityType: 'organization',
      entityId: id,
      action: AUDIT_ACTIONS.ORGANIZATION_UPDATED,
      newValue: input,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return toOrganizationDto(updated);
  }

  async listMembers(organizationId: string): Promise<MemberDto[]> {
    await this.ensureExists(organizationId);
    const members = await this.members.listByOrganization(organizationId);
    return members.map(toMemberDto);
  }

  async addMember(
    organizationId: string,
    input: AddMemberInput,
    ctx: RequestContext,
  ): Promise<MemberDto> {
    await this.ensureExists(organizationId);

    const user = await this.users.findById(input.userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    const existing = await this.members.findActive(organizationId, input.userId);
    if (existing) {
      throw new ConflictError('User is already a member of this organization');
    }

    const member = await this.members.create({
      organizationId,
      userId: input.userId,
      designation: input.designation ?? null,
      status: input.status,
      createdBy: ctx.userId,
    });

    // The user's org/vendor/restaurant binding is part of their cached auth
    // context — evict it so the new membership is reflected immediately.
    this.authContext.invalidate(input.userId);

    await this.audit.record({
      userId: ctx.userId,
      entityType: 'organization_member',
      entityId: member.id,
      action: AUDIT_ACTIONS.MEMBER_ADDED,
      newValue: { organizationId, userId: input.userId },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });

    return toMemberDto(member);
  }

  async listAddresses(organizationId: string): Promise<AddressDto[]> {
    await this.ensureExists(organizationId);
    const addresses = await this.addresses.listByOrganization(organizationId);
    return addresses.map(toAddressDto);
  }

  async addAddress(
    organizationId: string,
    input: AddAddressInput,
    _ctx: RequestContext,
  ): Promise<AddressDto> {
    await this.ensureExists(organizationId);

    if (input.isPrimary) {
      await this.addresses.clearPrimary(organizationId, input.addressType);
    }

    const created = await this.addresses.create({
      organizationId,
      addressLine1: input.addressLine1,
      addressLine2: input.addressLine2 ?? null,
      city: input.city,
      state: input.state,
      country: input.country,
      pincode: input.pincode,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      addressType: input.addressType,
      isPrimary: input.isPrimary,
    });

    return toAddressDto(created);
  }

  private async ensureExists(id: string): Promise<Organization> {
    const org = await this.organizations.findById(id);
    if (!org) {
      throw new NotFoundError('Organization not found');
    }
    return org;
  }
}
