import type { Prisma, User } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { ListResult } from '../../common/types';
import type { PrismaExecutor } from '../../database/prisma';
import { authUserInclude } from './user.types';
import type { AuthUser, CreateUserData, UpdateUserData } from './user.types';

interface ListArgs {
  skip: number;
  take: number;
  where: Prisma.UserWhereInput;
  orderBy: Prisma.UserOrderByWithRelationInput[];
}

export class UserRepository extends BaseRepository {
  findById(id: string, tx?: PrismaExecutor): Promise<User | null> {
    return this.exec(tx).user.findFirst({ where: { id, ...this.notDeleted } });
  }

  /** Login lookup — returns the active user (with password hash) for an email. */
  findByEmail(email: string, tx?: PrismaExecutor): Promise<User | null> {
    return this.exec(tx).user.findFirst({ where: { email, ...this.notDeleted } });
  }

  async existsByEmail(email: string, tx?: PrismaExecutor): Promise<boolean> {
    const found = await this.exec(tx).user.findFirst({
      where: { email, ...this.notDeleted },
      select: { id: true },
    });
    return found !== null;
  }

  /** Full graph needed to build the RBAC + profile request context. */
  findWithAuthData(id: string, tx?: PrismaExecutor): Promise<AuthUser | null> {
    return this.exec(tx).user.findFirst({
      where: { id, ...this.notDeleted },
      include: authUserInclude,
    });
  }

  create(data: CreateUserData, tx?: PrismaExecutor): Promise<User> {
    return this.exec(tx).user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone ?? null,
        passwordHash: data.passwordHash,
        status: data.status ?? 'PENDING',
      },
    });
  }

  update(id: string, data: UpdateUserData, tx?: PrismaExecutor): Promise<User> {
    return this.exec(tx).user.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
      },
    });
  }

  updateStatus(id: string, status: Prisma.UserUpdateInput['status'], tx?: PrismaExecutor): Promise<User> {
    return this.exec(tx).user.update({ where: { id }, data: { status } });
  }

  updatePassword(id: string, passwordHash: string, tx?: PrismaExecutor): Promise<User> {
    return this.exec(tx).user.update({ where: { id }, data: { passwordHash } });
  }

  updateLastLogin(id: string, when: Date, tx?: PrismaExecutor): Promise<User> {
    return this.exec(tx).user.update({ where: { id }, data: { lastLoginAt: when } });
  }

  softDelete(id: string, tx?: PrismaExecutor): Promise<User> {
    return this.exec(tx).user.update({
      where: { id },
      data: { deletedAt: new Date(), status: 'DEACTIVATED' },
    });
  }

  async list(args: ListArgs): Promise<ListResult<User>> {
    const where: Prisma.UserWhereInput = { ...args.where, ...this.notDeleted };
    const [items, total] = await this.db.$transaction([
      this.db.user.findMany({ where, skip: args.skip, take: args.take, orderBy: args.orderBy }),
      this.db.user.count({ where }),
    ]);
    return { items, total };
  }
}
