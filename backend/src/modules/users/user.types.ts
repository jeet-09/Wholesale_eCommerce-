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
  /** Role names granted to the user (empty when relations were not loaded). */
  roles: string[];
  /** Coarse account category derived from roles, for the admin console. */
  accountType: 'ADMIN' | 'OPERATIONS' | 'VENDOR' | 'RESTAURANT' | 'NONE';
  /** Owning organization name, when the user belongs to one. */
  organizationName: string | null;
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

/**
 * Lighter include for admin account listings — role names + the owning
 * organization (name/type) so the console can show "who is who" without the
 * full permission graph.
 */
export const userListInclude = {
  userRoles: { include: { role: { select: { name: true } } } },
  memberships: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    take: 1,
    include: { organization: { select: { name: true, organizationType: true } } },
  },
} satisfies Prisma.UserInclude;

export type UserWithRoles = Prisma.UserGetPayload<{ include: typeof userListInclude }>;
