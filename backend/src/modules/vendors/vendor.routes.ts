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
import type { VendorController } from './vendor.controller';
import { listVendorsQuerySchema, updateVendorSchema, vendorResponseSchema } from './vendor.schemas';
import type { ListVendorsQueryInput, UpdateVendorInput } from './vendor.schemas';

export function registerVendorRoutes(app: FastifyInstance, controller: VendorController): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.get<{ Querystring: ListVendorsQueryInput }>(
    '/vendors',
    {
      schema: {
        tags: ['vendors'],
        summary: 'List vendors',
        security: [{ bearerAuth: [] }],
        querystring: listVendorsQuerySchema,
        response: { 200: paginatedEnvelope(vendorResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.VENDOR_VIEW)],
    },
    controller.list,
  );

  router.get<{ Params: UuidParam }>(
    '/vendors/:id',
    {
      schema: {
        tags: ['vendors'],
        summary: 'Get a vendor profile',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        response: { 200: successEnvelope(vendorResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.VENDOR_VIEW)],
    },
    controller.getById,
  );

  router.patch<{ Params: UuidParam; Body: UpdateVendorInput }>(
    '/vendors/:id',
    {
      schema: {
        tags: ['vendors'],
        summary: 'Update a vendor profile',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        body: updateVendorSchema,
        response: { 200: successEnvelope(vendorResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.VENDOR_UPDATE)],
    },
    controller.update,
  );
}
