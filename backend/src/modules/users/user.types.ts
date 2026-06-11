import type { Prisma } from '@prisma/client';
import { MemberStatus } from '@prisma/client';

/** Public user representation (never includes password hash). */
export interface UserDto {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: string;
  isEmailVerified: boolean;
  isPhoneVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  passwordHash: string;
  status?: Prisma.UserCreateInput['status'];
}

export interface UpdateUserData {
  firstName?: string;
  lastName?: string;
  phone?: string | null;
}

/** Prisma include used to assemble the authenticated request context. */
export const authUserInclude = {
  userRoles: {
    include: {
      role: { include: { rolePermissions: { include: { permission: true } } } },
    },
  },
  memberships: {
    where: { deletedAt: null, status: MemberStatus.ACTIVE },
    include: { organization: { include: { vendor: true, restaurant: true } } },
  },
} satisfies Prisma.UserInclude;

export type AuthUser = Prisma.UserGetPayload<{ include: typeof authUserInclude }>;
