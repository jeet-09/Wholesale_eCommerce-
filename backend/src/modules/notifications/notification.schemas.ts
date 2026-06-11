import { z } from 'zod';

import { paginationQuerySchema } from '../../common/pagination';

export const notificationResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  message: z.string(),
  type: z.enum(['SYSTEM', 'ORDER', 'PAYMENT', 'INVENTORY']),
  data: z.unknown().nullable(),
  isRead: z.boolean(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export const listNotificationsQuerySchema = paginationQuerySchema.extend({
  isRead: z.coerce.boolean().optional(),
});

export const markAllReadResponseSchema = z.object({
  updated: z.number().int(),
});

export type ListNotificationsQueryInput = z.infer<typeof listNotificationsQuerySchema>;
