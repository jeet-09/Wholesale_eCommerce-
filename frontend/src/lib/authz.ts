'use client';

import { useMemo } from 'react';

import { useAuthStore } from './auth-store';

/** Permission keys mirrored from the backend RBAC catalog (common/permissions.ts). */
export const PERMISSIONS = {
  PRODUCT_CREATE: 'product:create',
  PRODUCT_UPDATE: 'product:update',
  PRODUCT_DELETE: 'product:delete',
  PRODUCT_REVIEW: 'product:review',
  OFFER_CREATE: 'offer:create',
  OFFER_VIEW: 'offer:view',
  OFFER_UPDATE: 'offer:update',
  OFFER_REVIEW: 'offer:review',
  PRICE_UPDATE: 'price:update',
  ORDER_ASSIGN: 'order:assign',
  ORDER_REVIEW: 'order:review',
  ORDER_COMPLETE: 'order:complete',
  PAYMENT_VERIFY: 'payment:verify',
  CALL_CREATE: 'call:create',
  PERFORMANCE_VIEW: 'performance:view',
  PERFORMANCE_RATE: 'performance:rate',
  ANALYTICS_VIEW: 'analytics:view',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface Authz {
  roles: string[];
  permissions: string[];
  vendorId: string | null;
  restaurantId: string | null;
  isAdmin: boolean;
  /** Admin or Operations — the platform "Administration" team. */
  isStaff: boolean;
  isVendor: boolean;
  isRestaurant: boolean;
  can: (permission: PermissionKey | string) => boolean;
}

/** Single source of truth for role/permission checks in the UI. */
export function useAuthz(): Authz {
  const context = useAuthStore((s) => s.context);

  return useMemo(() => {
    const roles = context?.roles ?? [];
    const permissions = context?.permissions ?? [];
    const permissionSet = new Set(permissions);
    return {
      roles,
      permissions,
      vendorId: context?.vendorId ?? null,
      restaurantId: context?.restaurantId ?? null,
      isAdmin: roles.includes('ADMIN'),
      isStaff: roles.includes('ADMIN') || roles.includes('OPERATIONS'),
      isVendor: Boolean(context?.vendorId),
      isRestaurant: Boolean(context?.restaurantId),
      can: (permission) => permissionSet.has(permission),
    };
  }, [context]);
}
