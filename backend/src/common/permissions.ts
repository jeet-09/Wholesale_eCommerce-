import { ROLES } from './types';
import type { RoleName } from './types';

/**
 * Canonical RBAC permission catalog. Route guards and the seed both import from
 * here so permissions can never drift between code and data (README → Auth).
 * Format: `<resource>:<action>` (DATABASE.md permissions).
 *
 * Role mapping to project-working.md actors:
 *   ADMIN        → "Admin"          (highest authority, full access)
 *   OPERATIONS   → "Administration" (daily operations: review, assign, verify)
 *   VENDOR       → "Vendor"         (price offers + fulfilment)
 *   RESTAURANT   → "Restaurant"     (browse, order, pay advance)
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
  VENDOR_MANAGE: 'vendor:manage',

  RESTAURANT_VIEW: 'restaurant:view',
  RESTAURANT_UPDATE: 'restaurant:update',

  CATEGORY_CREATE: 'category:create',
  CATEGORY_VIEW: 'category:view',
  CATEGORY_UPDATE: 'category:update',
  CATEGORY_DELETE: 'category:delete',

  // Master catalog — only Admin creates/edits; Administration may review status.
  PRODUCT_CREATE: 'product:create',
  PRODUCT_VIEW: 'product:view',
  PRODUCT_UPDATE: 'product:update',
  PRODUCT_DELETE: 'product:delete',
  PRODUCT_REVIEW: 'product:review',

  // Vendor price/stock offers against master products.
  OFFER_CREATE: 'offer:create',
  OFFER_VIEW: 'offer:view',
  OFFER_UPDATE: 'offer:update',
  OFFER_REVIEW: 'offer:review',

  // Selling price (computed average + transport, admin override).
  PRICE_VIEW: 'price:view',
  PRICE_UPDATE: 'price:update',

  CART_MANAGE: 'cart:manage',

  ORDER_CREATE: 'order:create',
  ORDER_VIEW: 'order:view',
  ORDER_UPDATE: 'order:update',
  ORDER_CANCEL: 'order:cancel',
  ORDER_REVIEW: 'order:review',
  ORDER_ASSIGN: 'order:assign',
  ORDER_COMPLETE: 'order:complete',

  PAYMENT_SUBMIT: 'payment:submit',
  PAYMENT_VIEW: 'payment:view',
  PAYMENT_VERIFY: 'payment:verify',

  CALL_CREATE: 'call:create',
  CALL_VIEW: 'call:view',

  PERFORMANCE_VIEW: 'performance:view',
  PERFORMANCE_RATE: 'performance:rate',

  ANALYTICS_VIEW: 'analytics:view',

  NOTIFICATION_VIEW: 'notification:view',
  NOTIFICATION_MANAGE: 'notification:manage',

  AUDIT_VIEW: 'audit:view',

  SETTINGS_VIEW: 'settings:view',
  SETTINGS_UPDATE: 'settings:update',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

// Vendor (supplier): submits price/stock offers and fulfils assigned orders.
const VENDOR_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.VENDOR_VIEW,
  PERMISSIONS.VENDOR_UPDATE,
  PERMISSIONS.CATEGORY_VIEW,
  PERMISSIONS.PRODUCT_VIEW,
  PERMISSIONS.OFFER_CREATE,
  PERMISSIONS.OFFER_VIEW,
  PERMISSIONS.OFFER_UPDATE,
  PERMISSIONS.ORDER_VIEW,
  PERMISSIONS.ORDER_UPDATE,
  PERMISSIONS.PERFORMANCE_VIEW,
  PERMISSIONS.NOTIFICATION_VIEW,
];

// Restaurant (buyer): browses approved catalog, orders, pays advance.
const RESTAURANT_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.RESTAURANT_VIEW,
  PERMISSIONS.RESTAURANT_UPDATE,
  PERMISSIONS.CATEGORY_VIEW,
  PERMISSIONS.PRODUCT_VIEW,
  PERMISSIONS.PRICE_VIEW,
  PERMISSIONS.CART_MANAGE,
  PERMISSIONS.ORDER_CREATE,
  PERMISSIONS.ORDER_VIEW,
  PERMISSIONS.ORDER_CANCEL,
  PERMISSIONS.PAYMENT_SUBMIT,
  PERMISSIONS.PAYMENT_VIEW,
  PERMISSIONS.NOTIFICATION_VIEW,
];

// Administration (operations): the daily-operations team that reviews orders,
// verifies advance payments, assigns vendors, tracks calls, and monitors KPIs.
const OPERATIONS_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.USER_VIEW,
  PERMISSIONS.ORGANIZATION_VIEW,
  PERMISSIONS.MEMBER_VIEW,
  PERMISSIONS.VENDOR_VIEW,
  PERMISSIONS.RESTAURANT_VIEW,
  PERMISSIONS.CATEGORY_VIEW,
  PERMISSIONS.PRODUCT_VIEW,
  PERMISSIONS.PRODUCT_REVIEW,
  PERMISSIONS.OFFER_VIEW,
  PERMISSIONS.OFFER_REVIEW,
  PERMISSIONS.PRICE_VIEW,
  PERMISSIONS.PRICE_UPDATE,
  PERMISSIONS.ORDER_VIEW,
  PERMISSIONS.ORDER_UPDATE,
  PERMISSIONS.ORDER_REVIEW,
  PERMISSIONS.ORDER_ASSIGN,
  PERMISSIONS.ORDER_COMPLETE,
  PERMISSIONS.PAYMENT_VIEW,
  PERMISSIONS.PAYMENT_VERIFY,
  PERMISSIONS.CALL_CREATE,
  PERMISSIONS.CALL_VIEW,
  PERMISSIONS.PERFORMANCE_VIEW,
  PERMISSIONS.PERFORMANCE_RATE,
  PERMISSIONS.ANALYTICS_VIEW,
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
