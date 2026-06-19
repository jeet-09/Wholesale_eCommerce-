import type { Prisma, User } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';

import {
  DuplicateResourceError,
  InternalError,
  NotFoundError,
  ValidationError,
} from '../../common/errors';
import { buildPaginationMeta, parseSort, toPaginationArgs } from '../../common/pagination';
import type { PaginationMeta } from '../../common/pagination';
import type { RequestContext } from '../../common/types';
import type { Database } from '../../database/prisma';
import type { PasswordHasher } from '../../utils/password';
import type { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit.types';
import type { UserRepository } from './user.repository';
import type { RoleRepository } from './role.repository';
import { toUserDto } from './user.mapper';
import type { UserDto } from './user.types';
import type {
  CreateUserInput,
  ListUsersQueryInput,
  SetPasswordInput,
  UpdateUserInput,
} from './user.schemas';

const SORTABLE_FIELDS = ['createdAt', 'email', 'firstName', 'lastName', 'status'] as const;

export class UserService {
  constructor(
    private readonly db: Database,
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuditService,
    private readonly logger: FastifyBaseLogger,
  ) {}

  async getById(id: string): Promise<UserDto> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return toUserDto(user);
  }

  async list(
    query: ListUsersQueryInput,
  ): Promise<{ items: UserDto[]; pagination: PaginationMeta }> {
    const where: Prisma.UserWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.role) {
      where.userRoles = { some: { role: { name: query.role } } };
    }
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search } },
      ];
    }

    const orderBy = parseSort(query.sort, SORTABLE_FIELDS).map((sort) => ({
      [sort.field]: sort.direction,
    })) as Prisma.UserOrderByWithRelationInput[];

    const { skip, take } = toPaginationArgs(query);
    const result = await this.users.list({ skip, take, where, orderBy });
    return {
      items: result.items.map(toUserDto),
      pagination: buildPaginationMeta(result.total, query),
    };
  }

  async create(input: CreateUserInput, ctx: RequestContext): Promise<UserDto> {
    if (await this.users.existsByEmail(input.email)) {
      throw new DuplicateResourceError('A user with this email already exists', [
        { field: 'email', message: 'Email is already in use' },
      ]);
    }

    const role = await this.roles.findByName(input.role);
    if (!role) {
      throw new InternalError(`Role "${input.role}" is not seeded`);
    }

    const passwordHash = await this.hasher.hash(input.password);

    const user = await this.db.$transaction(async (tx) => {
      const created = await this.users.create(
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
      await this.roles.assignRoleToUser(
        { userId: created.id, roleId: role.id, organizationId: input.organizationId ?? null },
        tx,
      );
      await this.audit.record(
        {
          userId: ctx.userId,
          entityType: 'user',
          entityId: created.id,
          action: AUDIT_ACTIONS.USER_CREATED,
          newValue: { email: created.email, role: input.role },
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          requestId: ctx.requestId,
        },
        tx,
      );
      return created;
    });

    this.logger.info({ userId: user.id }, 'user created');
    return toUserDto(user);
  }

  async update(id: string, input: UpdateUserInput, ctx: RequestContext): Promise<UserDto> {
    await this.ensureExists(id);
    const updated = await this.users.update(id, {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
    });
    await this.audit.record({
      userId: ctx.userId,
      entityType: 'user',
      entityId: id,
      action: AUDIT_ACTIONS.USER_UPDATED,
      newValue: input,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return toUserDto(updated);
  }

  async suspend(id: string, ctx: RequestContext): Promise<UserDto> {
    await this.ensureExists(id);
    if (id === ctx.userId) {
      throw new ValidationError('You cannot suspend your own account', [
        { field: 'id', message: 'Self-suspension is not allowed' },
      ]);
    }
    const updated = await this.users.updateStatus(id, 'SUSPENDED');
    await this.audit.record({
      userId: ctx.userId,
      entityType: 'user',
      entityId: id,
      action: AUDIT_ACTIONS.USER_SUSPENDED,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return toUserDto(updated);
  }

  /** Lift a suspension — restore a SUSPENDED/DEACTIVATED account to ACTIVE. */
  async reactivate(id: string, ctx: RequestContext): Promise<UserDto> {
    await this.ensureExists(id);
    const updated = await this.users.updateStatus(id, 'ACTIVE');
    await this.audit.record({
      userId: ctx.userId,
      entityType: 'user',
      entityId: id,
      action: AUDIT_ACTIONS.USER_REACTIVATED,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    return toUserDto(updated);
  }

  /**
   * Admin-set a new password directly (no email round-trip). All existing
   * sessions keep working until their access tokens expire; the user signs in
   * with the new password next time.
   */
  async setPassword(id: string, input: SetPasswordInput, ctx: RequestContext): Promise<UserDto> {
    const user = await this.ensureExists(id);
    const passwordHash = await this.hasher.hash(input.newPassword);
    await this.users.updatePassword(id, passwordHash);
    await this.audit.record({
      userId: ctx.userId,
      entityType: 'user',
      entityId: id,
      action: AUDIT_ACTIONS.USER_PASSWORD_RESET,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
    });
    this.logger.info({ userId: id, by: ctx.userId }, 'password reset by admin');
    return toUserDto(user);
  }

  private async ensureExists(id: string): Promise<User> {
    const user = await this.users.findById(id);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  }
}
