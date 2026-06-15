import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { commonErrorResponses, successEnvelope } from '../../common/schemas';
import type { AnalyticsController } from './analytics.controller';
import { dashboardResponseSchema } from './analytics.schemas';

export function registerAnalyticsRoutes(
  app: FastifyInstance,
  controller: AnalyticsController,
): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.get(
    '/analytics/dashboard',
    {
      schema: {
        tags: ['analytics'],
        summary: 'Role-scoped dashboard summary (Restaurant / Vendor / Administration / Admin)',
        security: [{ bearerAuth: [] }],
        response: { 200: successEnvelope(dashboardResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate],
    },
    controller.dashboard,
  );
}
