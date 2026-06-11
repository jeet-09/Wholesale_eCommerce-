import type { AuthContextLoader, AuthContextMeta } from '../../middleware/auth';
import type { RequestContext, RoleName } from '../../common/types';
import type { UserRepository } from '../users/user.repository';
import type { AuthUser } from '../users/user.types';

/**
 * Builds the authenticated request context from a verified user id: fresh roles,
 * permissions, and the active organization/vendor/restaurant binding. Loading
 * fresh on each request means RBAC changes take effect immediately
 * (TECHNICAL-DETAILS.MD §9).
 */
export class AuthContextService implements AuthContextLoader {
  constructor(private readonly users: UserRepository) {}

  async load(userId: string, meta: AuthContextMeta): Promise<RequestContext | null> {
    const user = await this.users.findWithAuthData(userId);
    if (!user || user.status !== 'ACTIVE') {
      return null;
    }
    return this.buildContext(user, meta);
  }

  private buildContext(user: AuthUser, meta: AuthContextMeta): RequestContext {
    const roles = new Set<string>();
    const permissions = new Set<string>();

    for (const userRole of user.userRoles) {
      roles.add(userRole.role.name);
      for (const rolePermission of userRole.role.rolePermissions) {
        permissions.add(rolePermission.permission.key);
      }
    }

    const membership = user.memberships[0] ?? null;
    const organization = membership?.organization ?? null;

    return {
      requestId: meta.requestId,
      userId: user.id,
      email: user.email,
      roles: Array.from(roles) as RoleName[],
      permissions: Array.from(permissions),
      organizationId: organization?.id ?? null,
      vendorId: organization?.vendor?.id ?? null,
      restaurantId: organization?.restaurant?.id ?? null,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    };
  }
}
