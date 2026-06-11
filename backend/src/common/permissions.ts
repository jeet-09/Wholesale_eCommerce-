import { ROLES } from './types';
import type { RoleName } from './types';

/**
 * Canonical RBAC permission catalog. Route guards and the seed both import from
 * here so permissions can never drift between code and data (README → Auth).
 * Format: `<resource>:<action>` (DATABASE.md permissions).
 */
export const PERMISSIONS = {
  USER_CREATE: 'user:create',
  USER_VIEW: 'user:view',
  USER_UPDATE: 'user:update',
  USER_SUSPEND: 'user:suspend',

  ORGANIZATION_CREATE: 'organization:create',
  ORGANIZATION_VIEW: 'organization:view',
  ORGANIZATION_UPDATE: 'organization:update',
  ORGANIZATION_DELETE: 'organization:delete',

  MEMBER_CREATE: 'member:create',
  MEMBER_VIEW: 'member:view',
  MEMBER_UPDATE: 'member:update',
  MEMBER_REMOVE: 'member:remove',

  VENDOR_VIEW: 'vendor:view',
  VENDOR_UPDATE: 'vendor:update',

  RESTAURANT_VIEW: 'restaurant:view',
  RESTAURANT_UPDATE: 'restaurant:update',

  CATEGORY_CREATE: 'category:create',
  CATEGORY_VIEW: 'category:view',
  CATEGORY_UPDATE: 'category:update',
  CATEGORY_DELETE: 'category:delete',

  PRODUCT_CREATE: 'product:create',
  PRODUCT_VIEW: 'product:view',
  PRODUCT_UPDATE: 'product:update',
  PRODUCT_DELETE: 'product:delete',

  PRICE_CREATE: 'price:create',
  PRICE_VIEW: 'price:view',

  INVENTORY_VIEW: 'inventory:view',
  INVENTORY_UPDATE: 'inventory:update',

  CART_MANAGE: 'cart:manage',

  ORDER_CREATE: 'order:create',
  ORDER_VIEW: 'order:view',
  ORDER_UPDATE: 'order:update',
  ORDER_CANCEL: 'order:cancel',

  NOTIFICATION_VIEW: 'notification:view',
  NOTIFICATION_MANAGE: 'notification:manage',

  AUDIT_VIEW: 'audit:view',

  SETTINGS_VIEW: 'settings:view',
  SETTINGS_UPDATE: 'settings:update',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

const VENDOR_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.VENDOR_VIEW,
  PERMISSIONS.VENDOR_UPDATE,
  PERMISSIONS.CATEGORY_VIEW,
  PERMISSIONS.PRODUCT_CREATE,
  PERMISSIONS.PRODUCT_VIEW,
  PERMISSIONS.PRODUCT_UPDATE,
  PERMISSIONS.PRODUCT_DELETE,
  PERMISSIONS.PRICE_CREATE,
  PERMISSIONS.PRICE_VIEW,
  PERMISSIONS.INVENTORY_VIEW,
  PERMISSIONS.INVENTORY_UPDATE,
  PERMISSIONS.ORDER_VIEW,
  PERMISSIONS.ORDER_UPDATE,
  PERMISSIONS.NOTIFICATION_VIEW,
];

const RESTAURANT_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.RESTAURANT_VIEW,
  PERMISSIONS.RESTAURANT_UPDATE,
  PERMISSIONS.CATEGORY_VIEW,
  PERMISSIONS.PRODUCT_VIEW,
  PERMISSIONS.PRICE_VIEW,
  PERMISSIONS.INVENTORY_VIEW,
  PERMISSIONS.CART_MANAGE,
  PERMISSIONS.ORDER_CREATE,
  PERMISSIONS.ORDER_VIEW,
  PERMISSIONS.ORDER_CANCEL,
  PERMISSIONS.NOTIFICATION_VIEW,
];

const OPERATIONS_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.USER_VIEW,
  PERMISSIONS.ORGANIZATION_VIEW,
  PERMISSIONS.MEMBER_VIEW,
  PERMISSIONS.VENDOR_VIEW,
  PERMISSIONS.RESTAURANT_VIEW,
  PERMISSIONS.CATEGORY_VIEW,
  PERMISSIONS.PRODUCT_VIEW,
  PERMISSIONS.PRICE_VIEW,
  PERMISSIONS.INVENTORY_VIEW,
  PERMISSIONS.ORDER_VIEW,
  PERMISSIONS.ORDER_UPDATE,
  PERMISSIONS.NOTIFICATION_VIEW,
  PERMISSIONS.AUDIT_VIEW,
  PERMISSIONS.SETTINGS_VIEW,
];

/** Role → permission keys, seeded into role_permissions. ADMIN gets everything. */
export const ROLE_PERMISSIONS: Record<RoleName, PermissionKey[]> = {
  [ROLES.ADMIN]: ALL_PERMISSIONS,
  [ROLES.OPERATIONS]: OPERATIONS_PERMISSIONS,
  [ROLES.VENDOR]: VENDOR_PERMISSIONS,
  [ROLES.RESTAURANT]: RESTAURANT_PERMISSIONS,
};
