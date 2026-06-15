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
import type { OrderController } from './order.controller';
import {
  assignVendorSchema,
  cancelOrderSchema,
  completeOrderSchema,
  listOrdersQuerySchema,
  orderResponseSchema,
  placeOrderSchema,
  rejectOrderSchema,
  updateFulfilmentSchema,
  vendorRespondSchema,
} from './order.schemas';
import type {
  AssignVendorInput,
  CancelOrderInput,
  CompleteOrderInput,
  ListOrdersQueryInput,
  PlaceOrderInput,
  RejectOrderInput,
  UpdateFulfilmentInput,
  VendorRespondInput,
} from './order.schemas';

export function registerOrderRoutes(app: FastifyInstance, controller: OrderController): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.post<{ Body: PlaceOrderInput }>(
    '/orders',
    {
      schema: {
        tags: ['orders'],
        summary: 'Place an order from the active cart',
        description:
          'Requires an `Idempotency-Key` header. Snapshots current selling prices, computes totals + the 30% advance, and creates the order in PENDING_PAYMENT. No vendor is assigned yet.',
        security: [{ bearerAuth: [] }],
        body: placeOrderSchema,
        response: { 201: successEnvelope(orderResponseSchema), ...commonErrorResponses },
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

  router.post<{ Params: UuidParam; Body: AssignVendorInput }>(
    '/orders/:id/assign',
    {
      schema: {
        tags: ['orders'],
        summary: 'Assign a vendor to a reviewed order (Administration)',
        description:
          'Reserves the chosen vendor offer stock and moves the order to VENDOR_ASSIGNED.',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        body: assignVendorSchema,
        response: { 200: successEnvelope(orderResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.ORDER_ASSIGN)],
    },
    controller.assignVendor,
  );

  router.post<{ Params: UuidParam; Body: VendorRespondInput }>(
    '/orders/:id/respond',
    {
      schema: {
        tags: ['orders'],
        summary: 'Vendor accepts or rejects an assignment',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        body: vendorRespondSchema,
        response: { 200: successEnvelope(orderResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.ORDER_UPDATE)],
    },
    controller.respond,
  );

  router.patch<{ Params: UuidParam; Body: UpdateFulfilmentInput }>(
    '/orders/:id/fulfilment',
    {
      schema: {
        tags: ['orders'],
        summary: 'Vendor advances fulfilment (processing → ready → delivered)',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        body: updateFulfilmentSchema,
        response: { 200: successEnvelope(orderResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.ORDER_UPDATE)],
    },
    controller.updateFulfilment,
  );

  router.post<{ Params: UuidParam; Body: CompleteOrderInput }>(
    '/orders/:id/complete',
    {
      schema: {
        tags: ['orders'],
        summary: 'Mark a delivered order COMPLETED (Administration)',
        description: 'Fulfils reserved stock and updates the vendor performance scorecard.',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        body: completeOrderSchema,
        response: { 200: successEnvelope(orderResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.ORDER_COMPLETE)],
    },
    controller.complete,
  );

  router.post<{ Params: UuidParam; Body: RejectOrderInput }>(
    '/orders/:id/reject',
    {
      schema: {
        tags: ['orders'],
        summary: 'Reject an order (Administration)',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        body: rejectOrderSchema,
        response: { 200: successEnvelope(orderResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.ORDER_REVIEW)],
    },
    controller.reject,
  );

  router.post<{ Params: UuidParam; Body: CancelOrderInput }>(
    '/orders/:id/cancel',
    {
      schema: {
        tags: ['orders'],
        summary: 'Cancel an order (restaurant pre-acceptance / Administration)',
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
