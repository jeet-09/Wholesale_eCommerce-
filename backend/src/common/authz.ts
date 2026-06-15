import { ForbiddenError } from './errors';
import { ROLES } from './types';
import type { RequestContext } from './types';

const PRIVILEGED_ROLES: string[] = [ROLES.ADMIN, ROLES.OPERATIONS];

/** Platform staff (admin/operations a.k.a. "Administration") act across orgs. */
export function isPrivileged(ctx: RequestContext): boolean {
  return ctx.roles.some((role) => PRIVILEGED_ROLES.includes(role));
}

/** True only for the top-level Admin role. */
export function isAdmin(ctx: RequestContext): boolean {
  return ctx.roles.includes(ROLES.ADMIN);
}

/**
 * Master-catalog mutations (create/edit/delete products) are Admin-only
 * (project-working.md PRODUCT MANAGEMENT). Throws for everyone else.
 */
export function assertAdmin(ctx: RequestContext): void {
  if (!isAdmin(ctx)) {
    throw new ForbiddenError('Only an Admin can perform this action');
  }
}

/**
 * Resource-level ownership (README → Authorization): a vendor may only mutate
 * its own resources; privileged staff may act on any. Throws otherwise.
 */
export function assertVendorAccess(ctx: RequestContext, vendorId: string): void {
  if (isPrivileged(ctx)) {
    return;
  }
  if (ctx.vendorId && ctx.vendorId === vendorId) {
    return;
  }
  throw new ForbiddenError('You can only access your own vendor resources');
}

export function assertRestaurantAccess(ctx: RequestContext, restaurantId: string): void {
  if (isPrivileged(ctx)) {
    return;
  }
  if (ctx.restaurantId && ctx.restaurantId === restaurantId) {
    return;
  }
  throw new ForbiddenError('You can only access your own restaurant resources');
}

/** Resolve the vendor id a vendor user is acting as, or fail. */
export function requireVendorId(ctx: RequestContext): string {
  if (!ctx.vendorId) {
    throw new ForbiddenError('This action requires a vendor account');
  }
  return ctx.vendorId;
}

/** Resolve the restaurant id a restaurant user is acting as, or fail. */
export function requireRestaurantId(ctx: RequestContext): string {
  if (!ctx.restaurantId) {
    throw new ForbiddenError('This action requires a restaurant account');
  }
  return ctx.restaurantId;
}
