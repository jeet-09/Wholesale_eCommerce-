import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { PERMISSIONS } from '../../common/permissions';
import { commonErrorResponses, paginatedEnvelope, successEnvelope } from '../../common/schemas';
import { paginationQuerySchema } from '../../common/pagination';
import type { PaginationQuery } from '../../common/pagination';
import type { PerformanceController } from './performance.controller';
import {
  performanceResponseSchema,
  rateVendorSchema,
  vendorIdParamSchema,
} from './performance.schemas';
import type { RateVendorInput, VendorIdParam } from './performance.schemas';

export function registerPerformanceRoutes(
  app: FastifyInstance,
  controller: PerformanceController,
): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.get<{ Querystring: PaginationQuery }>(
    '/vendor-performance',
    {
      schema: {
        tags: ['vendor-performance'],
        summary: 'List vendor scorecards (Administration / Admin monitoring)',
        security: [{ bearerAuth: [] }],
        querystring: paginationQuerySchema,
        response: { 200: paginatedEnvelope(performanceResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PERFORMANCE_VIEW)],
    },
    controller.list,
  );

  router.get<{ Params: VendorIdParam }>(
    '/vendor-performance/:vendorId',
    {
      schema: {
        tags: ['vendor-performance'],
        summary: 'Get a vendor scorecard (vendor: own; staff: any)',
        security: [{ bearerAuth: [] }],
        params: vendorIdParamSchema,
        response: { 200: successEnvelope(performanceResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PERFORMANCE_VIEW)],
    },
    controller.getForVendor,
  );

  router.post<{ Params: VendorIdParam; Body: RateVendorInput }>(
    '/vendor-performance/:vendorId/rating',
    {
      schema: {
        tags: ['vendor-performance'],
        summary: 'Rate a vendor 1-5 (Administration / Admin)',
        security: [{ bearerAuth: [] }],
        params: vendorIdParamSchema,
        body: rateVendorSchema,
        response: { 200: successEnvelope(performanceResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PERFORMANCE_RATE)],
    },
    controller.rate,
  );
}
