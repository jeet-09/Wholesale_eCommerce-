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
import type { OfferController } from './offer.controller';
import {
  listOffersQuerySchema,
  offerResponseSchema,
  reviewOfferSchema,
  submitOfferSchema,
  updateOfferSchema,
} from './offer.schemas';
import type {
  ListOffersQueryInput,
  ReviewOfferInput,
  SubmitOfferInput,
  UpdateOfferInput,
} from './offer.schemas';

export function registerOfferRoutes(app: FastifyInstance, controller: OfferController): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.get<{ Querystring: ListOffersQueryInput }>(
    '/offers',
    {
      schema: {
        tags: ['offers'],
        summary: 'List vendor offers (vendor: own; Administration/Admin: all)',
        security: [{ bearerAuth: [] }],
        querystring: listOffersQuerySchema,
        response: { 200: paginatedEnvelope(offerResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.OFFER_VIEW)],
    },
    controller.list,
  );

  router.get<{ Params: UuidParam }>(
    '/offers/:id',
    {
      schema: {
        tags: ['offers'],
        summary: 'Get a vendor offer',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        response: { 200: successEnvelope(offerResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.OFFER_VIEW)],
    },
    controller.getById,
  );

  router.post<{ Body: SubmitOfferInput }>(
    '/offers',
    {
      schema: {
        tags: ['offers'],
        summary: 'Submit a price + stock offer for an approved product (Vendor)',
        security: [{ bearerAuth: [] }],
        body: submitOfferSchema,
        response: { 201: successEnvelope(offerResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.OFFER_CREATE)],
    },
    controller.submit,
  );

  router.patch<{ Params: UuidParam; Body: UpdateOfferInput }>(
    '/offers/:id',
    {
      schema: {
        tags: ['offers'],
        summary: 'Update your offer price / available quantity (Vendor)',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        body: updateOfferSchema,
        response: { 200: successEnvelope(offerResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.OFFER_UPDATE)],
    },
    controller.update,
  );

  router.patch<{ Params: UuidParam; Body: ReviewOfferInput }>(
    '/offers/:id/review',
    {
      schema: {
        tags: ['offers'],
        summary: 'Approve / reject / deactivate an offer (Administration / Admin)',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        body: reviewOfferSchema,
        response: { 200: successEnvelope(offerResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.OFFER_REVIEW)],
    },
    controller.review,
  );
}
