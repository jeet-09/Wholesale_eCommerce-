import type { TransactionClient } from '../../database/prisma';

/** Stable audit action names (DATABASE.md audit_logs examples). No magic strings. */
export const AUDIT_ACTIONS = {
  USER_CREATED: 'USER_CREATED',
  USER_SUSPENDED: 'USER_SUSPENDED',
  USER_UPDATED: 'USER_UPDATED',
  ORGANIZATION_CREATED: 'ORGANIZATION_CREATED',
  ORGANIZATION_UPDATED: 'ORGANIZATION_UPDATED',
  MEMBER_ADDED: 'MEMBER_ADDED',
  PRODUCT_CREATED: 'PRODUCT_CREATED',
  PRODUCT_UPDATED: 'PRODUCT_UPDATED',
  PRODUCT_DELETED: 'PRODUCT_DELETED',
  PRICE_CHANGED: 'PRICE_CHANGED',
  INVENTORY_UPDATED: 'INVENTORY_UPDATED',
  ORDER_PLACED: 'ORDER_PLACED',
  ORDER_ACCEPTED: 'ORDER_ACCEPTED',
  ORDER_REJECTED: 'ORDER_REJECTED',
  ORDER_STATUS_CHANGED: 'ORDER_STATUS_CHANGED',
  ORDER_CANCELLED: 'ORDER_CANCELLED',
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
