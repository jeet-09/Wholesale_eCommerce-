import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { PERMISSIONS } from '../../common/permissions';
import { commonErrorResponses, successEnvelope } from '../../common/schemas';
import type { InventoryController } from './inventory.controller';
import {
  inventoryResponseSchema,
  productIdParamSchema,
  updateInventorySchema,
} from './inventory.schemas';
import type { ProductIdParam, UpdateInventoryInput } from './inventory.schemas';

export function registerInventoryRoutes(
  app: FastifyInstance,
  controller: InventoryController,
): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.get<{ Params: ProductIdParam }>(
    '/products/:productId/inventory',
    {
      schema: {
        tags: ['inventory'],
        summary: 'Get inventory for a product',
        security: [{ bearerAuth: [] }],
        params: productIdParamSchema,
        response: { 200: successEnvelope(inventoryResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.INVENTORY_VIEW)],
    },
    controller.getByProduct,
  );

  router.patch<{ Params: ProductIdParam; Body: UpdateInventoryInput }>(
    '/products/:productId/inventory',
    {
      schema: {
        tags: ['inventory'],
        summary: 'Adjust stock levels for a product',
        security: [{ bearerAuth: [] }],
        params: productIdParamSchema,
        body: updateInventorySchema,
        response: { 200: successEnvelope(inventoryResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.INVENTORY_UPDATE)],
    },
    controller.adjust,
  );
}
