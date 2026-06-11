import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { PERMISSIONS } from '../../common/permissions';
import {
  commonErrorResponses,
  paginatedEnvelope,
  successEnvelope,
  uuidParamSchema,
} from '../../common/schemas';
import type { UuidParam } from '../../common/schemas';
import type { NotificationController } from './notification.controller';
import {
  listNotificationsQuerySchema,
  markAllReadResponseSchema,
  notificationResponseSchema,
} from './notification.schemas';
import type { ListNotificationsQueryInput } from './notification.schemas';

export function registerNotificationRoutes(
  app: FastifyInstance,
  controller: NotificationController,
): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.get<{ Querystring: ListNotificationsQueryInput }>(
    '/notifications',
    {
      schema: {
        tags: ['notifications'],
        summary: 'List my notifications',
        security: [{ bearerAuth: [] }],
        querystring: listNotificationsQuerySchema,
        response: { 200: paginatedEnvelope(notificationResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.NOTIFICATION_VIEW)],
    },
    controller.list,
  );

  router.post(
    '/notifications/read-all',
    {
      schema: {
        tags: ['notifications'],
        summary: 'Mark all my notifications as read',
        security: [{ bearerAuth: [] }],
        response: { 200: successEnvelope(markAllReadResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.NOTIFICATION_VIEW)],
    },
    controller.markAllRead,
  );

  router.patch<{ Params: UuidParam }>(
    '/notifications/:id/read',
    {
      schema: {
        tags: ['notifications'],
        summary: 'Mark a notification as read',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        response: { 200: successEnvelope(notificationResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.NOTIFICATION_VIEW)],
    },
    controller.markRead,
  );
}
