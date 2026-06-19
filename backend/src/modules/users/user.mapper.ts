import type { User } from '@prisma/client';

import { ROLES } from '../../common/types';
import type { UserDto } from './user.types';

/** Accepts a plain user or one enriched with role/membership relations. */
type UserDtoSource = User & {
  userRoles?: { role: { name: string } }[];
  memberships?: { organization: { name: string; organizationType: string } | null }[];
};

function deriveAccountType(roles: string[]): UserDto['accountType'] {
  if (roles.includes(ROLES.ADMIN)) return 'ADMIN';
  if (roles.includes(ROLES.OPERATIONS)) return 'OPERATIONS';
  if (roles.includes(ROLES.VENDOR)) return 'VENDOR';
  if (roles.includes(ROLES.RESTAURANT)) return 'RESTAURANT';
  return 'NONE';
}

export function toUserDto(user: UserDtoSource): UserDto {
  const roles = user.userRoles?.map((userRole) => userRole.role.name) ?? [];
  const organizationName = user.memberships?.[0]?.organization?.name ?? null;
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    phone: user.phone,
    status: user.status,
    isEmailVerified: user.isEmailVerified,
    isPhoneVerified: user.isPhoneVerified,
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
    roles,
    accountType: deriveAccountType(roles),
    organizationName,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}
