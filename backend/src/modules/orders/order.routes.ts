import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

import { PERMISSIONS } from '../../common/permissions';
import {
  commonErrorResponses,
  paginatedEnvelope,
  successEnvelope,
  uuidParamSchema,
} from '../../common/schemas';
import type { UuidParam } from '../../common/schemas';
import type { OrderController } from './order.controller';
import {
  cancelOrderSchema,
  listOrdersQuerySchema,
  orderResponseSchema,
  placeOrderSchema,
  updateOrderStatusSchema,
} from './order.schemas';
import type {
  CancelOrderInput,
  ListOrdersQueryInput,
  PlaceOrderInput,
  UpdateOrderStatusInput,
} from './order.schemas';

export function registerOrderRoutes(app: FastifyInstance, controller: OrderController): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.post<{ Body: PlaceOrderInput }>(
    '/orders',
    {
      schema: {
        tags: ['orders'],
        summary: 'Place orders from the active cart (one order per vendor)',
        description:
          'Requires an `Idempotency-Key` header. Re-reads prices, validates and reserves stock, and checks out the cart in a single transaction.',
        security: [{ bearerAuth: [] }],
        body: placeOrderSchema,
        response: {
          201: successEnvelope(z.array(orderResponseSchema)),
          ...commonErrorResponses,
        },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.ORDER_CREATE), app.idempotent()],
    },
    controller.place,
  );

  router.get<{ Querystring: ListOrdersQueryInput }>(
    '/orders',
    {
      schema: {
        tags: ['orders'],
        summary: 'List orders (scoped to the caller)',
        security: [{ bearerAuth: [] }],
        querystring: listOrdersQuerySchema,
        response: { 200: paginatedEnvelope(orderResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.ORDER_VIEW)],
    },
    controller.list,
  );

  router.get<{ Params: UuidParam }>(
    '/orders/:id',
    {
      schema: {
        tags: ['orders'],
        summary: 'Get an order',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        response: { 200: successEnvelope(orderResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.ORDER_VIEW)],
    },
    controller.getById,
  );

  router.patch<{ Params: UuidParam; Body: UpdateOrderStatusInput }>(
    '/orders/:id/status',
    {
      schema: {
        tags: ['orders'],
        summary: 'Update order status (vendor / operations)',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        body: updateOrderStatusSchema,
        response: { 200: successEnvelope(orderResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.ORDER_UPDATE)],
    },
    controller.updateStatus,
  );

  router.post<{ Params: UuidParam; Body: CancelOrderInput }>(
    '/orders/:id/cancel',
    {
      schema: {
        tags: ['orders'],
        summary: 'Cancel an order (restaurant / admin)',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        body: cancelOrderSchema,
        response: { 200: successEnvelope(orderResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.ORDER_CANCEL)],
    },
    controller.cancel,
  );
}
