import { z } from 'zod';

import { paginationQuerySchema } from '../../common/pagination';

export const auditListQuerySchema = paginationQuerySchema.extend({
  entityType: z.string().min(1).max(100).optional(),
  entityId: z.string().min(1).max(100).optional(),
  userId: z.string().uuid().optional(),
  action: z.string().min(1).max(100).optional(),
});

export type AuditListQueryInput = z.infer<typeof auditListQuerySchema>;

export const auditLogSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  entityType: z.string(),
  entityId: z.string(),
  action: z.string(),
  oldValue: z.unknown().nullable(),
  newValue: z.unknown().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  requestId: z.string().nullable(),
  createdAt: z.string(),
});
