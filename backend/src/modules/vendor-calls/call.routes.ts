import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { PERMISSIONS } from '../../common/permissions';
import { commonErrorResponses, paginatedEnvelope, successEnvelope } from '../../common/schemas';
import type { CallController } from './call.controller';
import {
  callOrderIdParamSchema,
  callResponseSchema,
  listCallsQuerySchema,
  logCallSchema,
} from './call.schemas';
import type { CallOrderIdParam, ListCallsQueryInput, LogCallInput } from './call.schemas';

export function registerCallRoutes(app: FastifyInstance, controller: CallController): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.post<{ Params: CallOrderIdParam; Body: LogCallInput }>(
    '/orders/:orderId/calls',
    {
      schema: {
        tags: ['vendor-calls'],
        summary: 'Log a vendor call outcome for an order (Administration)',
        security: [{ bearerAuth: [] }],
        params: callOrderIdParamSchema,
        body: logCallSchema,
        response: { 201: successEnvelope(callResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.CALL_CREATE)],
    },
    controller.log,
  );

  router.get<{ Params: CallOrderIdParam }>(
    '/orders/:orderId/calls',
    {
      schema: {
        tags: ['vendor-calls'],
        summary: 'List call logs for an order (Administration)',
        security: [{ bearerAuth: [] }],
        params: callOrderIdParamSchema,
        response: { 200: successEnvelope(z.array(callResponseSchema)), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.CALL_VIEW)],
    },
    controller.listForOrder,
  );

  router.get<{ Querystring: ListCallsQueryInput }>(
    '/vendor-calls',
    {
      schema: {
        tags: ['vendor-calls'],
        summary: 'List vendor call logs (Administration)',
        security: [{ bearerAuth: [] }],
        querystring: listCallsQuerySchema,
        response: { 200: paginatedEnvelope(callResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.CALL_VIEW)],
    },
    controller.list,
  );
}
