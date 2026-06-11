/**
 * Cross-cutting types shared across modules.
 */

/** Application roles (README → Authorization). */
export const ROLES = {
  ADMIN: 'ADMIN',
  OPERATIONS: 'OPERATIONS',
  VENDOR: 'VENDOR',
  RESTAURANT: 'RESTAURANT',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

/**
 * Typed, per-request authenticated context attached by the `authenticate` hook
 * (TECHNICAL-DETAILS.MD §9). Services use it for ownership checks; controllers
 * pass it down. It never carries `req`/`reply`.
 */
export interface RequestContext {
  requestId: string;
  userId: string;
  email: string;
  roles: RoleName[];
  permissions: string[];
  /** Active organization for the user's session (if any). */
  organizationId: string | null;
  /** Restaurant profile id when the user belongs to a RESTAURANT org. */
  restaurantId: string | null;
  /** Vendor profile id when the user belongs to a VENDOR org. */
  vendorId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface ListResult<T> {
  items: T[];
  total: number;
}
