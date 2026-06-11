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
import type { RestaurantController } from './restaurant.controller';
import {
  listRestaurantsQuerySchema,
  restaurantResponseSchema,
  updateRestaurantSchema,
} from './restaurant.schemas';
import type { ListRestaurantsQueryInput, UpdateRestaurantInput } from './restaurant.schemas';

export function registerRestaurantRoutes(
  app: FastifyInstance,
  controller: RestaurantController,
): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.get<{ Querystring: ListRestaurantsQueryInput }>(
    '/restaurants',
    {
      schema: {
        tags: ['restaurants'],
        summary: 'List restaurants',
        security: [{ bearerAuth: [] }],
        querystring: listRestaurantsQuerySchema,
        response: { 200: paginatedEnvelope(restaurantResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.RESTAURANT_VIEW)],
    },
    controller.list,
  );

  router.get<{ Params: UuidParam }>(
    '/restaurants/:id',
    {
      schema: {
        tags: ['restaurants'],
        summary: 'Get a restaurant profile',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        response: { 200: successEnvelope(restaurantResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.RESTAURANT_VIEW)],
    },
    controller.getById,
  );

  router.patch<{ Params: UuidParam; Body: UpdateRestaurantInput }>(
    '/restaurants/:id',
    {
      schema: {
        tags: ['restaurants'],
        summary: 'Update a restaurant profile',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        body: updateRestaurantSchema,
        response: { 200: successEnvelope(restaurantResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.RESTAURANT_UPDATE)],
    },
    controller.update,
  );
}
