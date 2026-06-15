import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { PERMISSIONS } from '../../common/permissions';
import { commonErrorResponses, paginatedEnvelope, successEnvelope } from '../../common/schemas';
import { paginationQuerySchema } from '../../common/pagination';
import type { PaginationQuery } from '../../common/pagination';
import type { PricingController } from './price.controller';
import {
  priceProductParamSchema,
  priceResponseSchema,
  priceSuggestionResponseSchema,
  setPriceSchema,
} from './price.schemas';
import type { PriceProductParam, SetPriceInput } from './price.schemas';

export function registerPricingRoutes(app: FastifyInstance, controller: PricingController): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.get<{ Params: PriceProductParam }>(
    '/products/:productId/price',
    {
      schema: {
        tags: ['pricing'],
        summary: 'Get the current selling price of a product',
        security: [{ bearerAuth: [] }],
        params: priceProductParamSchema,
        response: { 200: successEnvelope(priceResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PRICE_VIEW)],
    },
    controller.getCurrent,
  );

  router.get<{ Params: PriceProductParam }>(
    '/products/:productId/price-suggestion',
    {
      schema: {
        tags: ['pricing'],
        summary: 'Suggested price from average vendor offer + transport (Administration / Admin)',
        security: [{ bearerAuth: [] }],
        params: priceProductParamSchema,
        response: { 200: successEnvelope(priceSuggestionResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PRICE_UPDATE)],
    },
    controller.getSuggestion,
  );

  router.get<{ Params: PriceProductParam; Querystring: PaginationQuery }>(
    '/products/:productId/price-history',
    {
      schema: {
        tags: ['pricing'],
        summary: 'List the append-only selling-price history of a product',
        security: [{ bearerAuth: [] }],
        params: priceProductParamSchema,
        querystring: paginationQuerySchema,
        response: { 200: paginatedEnvelope(priceResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PRICE_VIEW)],
    },
    controller.listHistory,
  );

  router.post<{ Params: PriceProductParam; Body: SetPriceInput }>(
    '/products/:productId/price',
    {
      schema: {
        tags: ['pricing'],
        summary: 'Set/override the selling price (Administration / Admin)',
        description:
          'Omit `price` to accept the computed average + transport; provide `price` to override. Closes the current price row and inserts a new one.',
        security: [{ bearerAuth: [] }],
        params: priceProductParamSchema,
        body: setPriceSchema,
        response: { 201: successEnvelope(priceResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PRICE_UPDATE)],
    },
    controller.setPrice,
  );
}
