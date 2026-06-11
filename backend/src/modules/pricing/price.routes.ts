import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { PERMISSIONS } from '../../common/permissions';
import { commonErrorResponses, paginatedEnvelope, successEnvelope } from '../../common/schemas';
import { paginationQuerySchema } from '../../common/pagination';
import type { PaginationQuery } from '../../common/pagination';
import type { PricingController } from './price.controller';
import { changePriceSchema, priceProductParamSchema, priceResponseSchema } from './price.schemas';
import type { ChangePriceInput, PriceProductParam } from './price.schemas';

export function registerPricingRoutes(app: FastifyInstance, controller: PricingController): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.get<{ Params: PriceProductParam }>(
    '/products/:productId/price',
    {
      schema: {
        tags: ['pricing'],
        summary: 'Get the current price of a product',
        security: [{ bearerAuth: [] }],
        params: priceProductParamSchema,
        response: { 200: successEnvelope(priceResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PRICE_VIEW)],
    },
    controller.getCurrent,
  );

  router.get<{ Params: PriceProductParam; Querystring: PaginationQuery }>(
    '/products/:productId/price-history',
    {
      schema: {
        tags: ['pricing'],
        summary: 'List the append-only price history of a product',
        security: [{ bearerAuth: [] }],
        params: priceProductParamSchema,
        querystring: paginationQuerySchema,
        response: { 200: paginatedEnvelope(priceResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PRICE_VIEW)],
    },
    controller.listHistory,
  );

  router.post<{ Params: PriceProductParam; Body: ChangePriceInput }>(
    '/products/:productId/price',
    {
      schema: {
        tags: ['pricing'],
        summary: 'Change a product price (closes current, inserts new)',
        security: [{ bearerAuth: [] }],
        params: priceProductParamSchema,
        body: changePriceSchema,
        response: { 201: successEnvelope(priceResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PRICE_CREATE)],
    },
    controller.changePrice,
  );
}
