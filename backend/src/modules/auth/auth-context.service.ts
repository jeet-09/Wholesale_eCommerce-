import type {
  AuthContextInvalidator,
  AuthContextLoader,
  AuthContextMeta,
} from '../../middleware/auth';
import type { RequestContext, RoleName } from '../../common/types';
import { TtlCache } from '../../utils/cache';
import type { UserRepository } from '../users/user.repository';
import type { AuthUser } from '../users/user.types';

/** Stable, per-user slice of the request context (everything except per-request meta). */
export interface AuthIdentity {
  userId: string;
  email: string;
  roles: RoleName[];
  permissions: string[];
  organizationId: string | null;
  restaurantId: string | null;
  vendorId: string | null;
}

/**
 * Auth identity is read on EVERY authenticated request, so it is cached briefly
 * per user. Two safeguards keep it correct:
 *  - Only the stable identity (roles/permissions/org binding) is cached; the
 *    per-request meta (requestId/ip/userAgent) is merged in fresh every time.
 *  - It is invalidated explicitly whenever a user's status or org binding
 *    changes (suspend/reactivate/add-member). The short TTL is only a backstop
 *    for any out-of-band database edits.
 */
const AUTH_CONTEXT_TTL_MS = 30_000;
const AUTH_CONTEXT_MAX_ENTRIES = 10_000;

/**
 * Builds the authenticated request context from a verified user id: roles,
 * permissions, and the active organization/vendor/restaurant binding. RBAC
 * changes still take effect immediately because every mutation that can alter a
 * user's identity invalidates this cache (TECHNICAL-DETAILS.MD §9).
 */
export class AuthContextService implements AuthContextLoader, AuthContextInvalidator {
  constructor(
    private readonly users: UserRepository,
    private readonly cache: TtlCache<AuthIdentity> = new TtlCache<AuthIdentity>({
      ttlMs: AUTH_CONTEXT_TTL_MS,
      maxEntries: AUTH_CONTEXT_MAX_ENTRIES,
    }),
  ) {}

  async load(userId: string, meta: AuthContextMeta): Promise<RequestContext | null> {
    const cached = this.cache.get(userId);
    if (cached) {
      return this.withMeta(cached, meta);
    }

    const user = await this.users.findWithAuthData(userId);
    if (!user || user.status !== 'ACTIVE') {
      // Never cache missing/inactive users: a reactivation must be honoured at
      // once, and we also invalidate explicitly on status changes.
      return null;
    }

    const identity = this.buildIdentity(user);
    this.cache.set(userId, identity);
    return this.withMeta(identity, meta);
  }

  /** Drop a user's cached identity (call after status or org-binding changes). */
  invalidate(userId: string): void {
    this.cache.delete(userId);
  }

  private withMeta(identity: AuthIdentity, meta: AuthContextMeta): RequestContext {
    return {
      requestId: meta.requestId,
      userId: identity.userId,
      email: identity.email,
      roles: identity.roles,
      permissions: identity.permissions,
      organizationId: identity.organizationId,
      restaurantId: identity.restaurantId,
      vendorId: identity.vendorId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    };
  }

  private buildIdentity(user: AuthUser): AuthIdentity {
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
      userId: user.id,
      email: user.email,
      roles: Array.from(roles) as RoleName[],
      permissions: Array.from(permissions),
      organizationId: organization?.id ?? null,
      restaurantId: organization?.restaurant?.id ?? null,
      vendorId: organization?.vendor?.id ?? null,
    };
  }
}
