import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { PERMISSIONS } from '../../common/permissions';
import { commonErrorResponses, paginatedEnvelope } from '../../common/schemas';
import type { AuditController } from './audit.controller';
import { auditListQuerySchema, auditLogSchema } from './audit.schemas';
import type { AuditListQueryInput } from './audit.schemas';

export function registerAuditRoutes(app: FastifyInstance, controller: AuditController): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.get<{ Querystring: AuditListQueryInput }>(
    '/audit-logs',
    {
      schema: {
        tags: ['audit'],
        summary: 'List audit logs (append-only)',
        security: [{ bearerAuth: [] }],
        querystring: auditListQuerySchema,
        response: {
          200: paginatedEnvelope(auditLogSchema),
          ...commonErrorResponses,
        },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.AUDIT_VIEW)],
    },
    controller.list,
  );
}
