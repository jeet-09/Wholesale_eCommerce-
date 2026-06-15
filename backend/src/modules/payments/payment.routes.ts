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
import type { PaymentController } from './payment.controller';
import {
  listPaymentsQuerySchema,
  orderIdParamSchema,
  paymentResponseSchema,
  rejectPaymentSchema,
  submitPaymentSchema,
} from './payment.schemas';
import type {
  ListPaymentsQueryInput,
  OrderIdParam,
  RejectPaymentInput,
  SubmitPaymentInput,
} from './payment.schemas';

export function registerPaymentRoutes(app: FastifyInstance, controller: PaymentController): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.post<{ Params: OrderIdParam; Body: SubmitPaymentInput }>(
    '/orders/:orderId/payments',
    {
      schema: {
        tags: ['payments'],
        summary: 'Submit advance-payment proof (Restaurant)',
        description:
          'Uploads the PhonePe/UPI transaction proof for the 30% advance. Requires an `Idempotency-Key` header.',
        security: [{ bearerAuth: [] }],
        params: orderIdParamSchema,
        body: submitPaymentSchema,
        response: { 201: successEnvelope(paymentResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PAYMENT_SUBMIT), app.idempotent()],
    },
    controller.submit,
  );

  router.get<{ Params: OrderIdParam }>(
    '/orders/:orderId/payments',
    {
      schema: {
        tags: ['payments'],
        summary: 'List payments for an order',
        security: [{ bearerAuth: [] }],
        params: orderIdParamSchema,
        response: { 200: successEnvelope(z.array(paymentResponseSchema)), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PAYMENT_VIEW)],
    },
    controller.listForOrder,
  );

  router.get<{ Querystring: ListPaymentsQueryInput }>(
    '/payments',
    {
      schema: {
        tags: ['payments'],
        summary: 'List payments (Administration: verification queue)',
        security: [{ bearerAuth: [] }],
        querystring: listPaymentsQuerySchema,
        response: { 200: paginatedEnvelope(paymentResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PAYMENT_VIEW)],
    },
    controller.list,
  );

  router.post<{ Params: UuidParam }>(
    '/payments/:id/verify',
    {
      schema: {
        tags: ['payments'],
        summary: 'Verify an advance payment (Administration)',
        description: 'Confirms the proof and moves the order to PENDING_ADMIN_REVIEW.',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        response: { 200: successEnvelope(paymentResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PAYMENT_VERIFY)],
    },
    controller.verify,
  );

  router.post<{ Params: UuidParam; Body: RejectPaymentInput }>(
    '/payments/:id/reject',
    {
      schema: {
        tags: ['payments'],
        summary: 'Reject an advance payment (Administration)',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        body: rejectPaymentSchema,
        response: { 200: successEnvelope(paymentResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PAYMENT_VERIFY)],
    },
    controller.reject,
  );
}
