import type { TransactionClient } from '../../database/prisma';

/** Stable audit action names (DATABASE.md audit_logs examples). No magic strings. */
export const AUDIT_ACTIONS = {
  USER_CREATED: 'USER_CREATED',
  USER_SUSPENDED: 'USER_SUSPENDED',
  USER_REACTIVATED: 'USER_REACTIVATED',
  USER_UPDATED: 'USER_UPDATED',
  USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
  VENDOR_CREATED: 'VENDOR_CREATED',
  ORGANIZATION_CREATED: 'ORGANIZATION_CREATED',
  ORGANIZATION_UPDATED: 'ORGANIZATION_UPDATED',
  MEMBER_ADDED: 'MEMBER_ADDED',
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  PRODUCT_DELETED: 'PRODUCT_DELETED',
  PRODUCT_STATUS_CHANGED: 'PRODUCT_STATUS_CHANGED',
  PRICE_CHANGED: 'PRICE_CHANGED',
  OFFER_SUBMITTED: 'OFFER_SUBMITTED',
  OFFER_UPDATED: 'OFFER_UPDATED',
  OFFER_STATUS_CHANGED: 'OFFER_STATUS_CHANGED',
  INVENTORY_UPDATED: 'INVENTORY_UPDATED',
  ORDER_PLACED: 'ORDER_PLACED',
  ORDER_PAYMENT_SUBMITTED: 'ORDER_PAYMENT_SUBMITTED',
  ORDER_PAYMENT_VERIFIED: 'ORDER_PAYMENT_VERIFIED',
  ORDER_PAYMENT_REJECTED: 'ORDER_PAYMENT_REJECTED',
  ORDER_REVIEWED: 'ORDER_REVIEWED',
  ORDER_VENDOR_ASSIGNED: 'ORDER_VENDOR_ASSIGNED',
  ORDER_ACCEPTED: 'ORDER_ACCEPTED',
  ORDER_REJECTED: 'ORDER_REJECTED',
  ORDER_STATUS_CHANGED: 'ORDER_STATUS_CHANGED',
  ORDER_STATUS_OVERRIDDEN: 'ORDER_STATUS_OVERRIDDEN',
  ORDER_COMPLETED: 'ORDER_COMPLETED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
  VENDOR_CALL_LOGGED: 'VENDOR_CALL_LOGGED',
  VENDOR_RATED: 'VENDOR_RATED',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditEntryInput {
  userId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface AuditLogDto {
  id: string;
  userId: string | null;
  entityType: string;
  entityId: string;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  createdAt: string;
}

export type AuditTx = TransactionClient | undefined;
