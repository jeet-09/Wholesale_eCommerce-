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
import type { ProductController } from './product.controller';
import {
  createProductSchema,
  listProductsQuerySchema,
  productResponseSchema,
  updateProductSchema,
} from './product.schemas';
import type {
  CreateProductInput,
  ListProductsQueryInput,
  UpdateProductInput,
} from './product.schemas';

export function registerProductRoutes(app: FastifyInstance, controller: ProductController): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.get<{ Querystring: ListProductsQueryInput }>(
    '/products',
    {
      schema: {
        tags: ['products'],
        summary: 'List products (storefront / vendor catalog)',
        security: [{ bearerAuth: [] }],
        querystring: listProductsQuerySchema,
        response: { 200: paginatedEnvelope(productResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PRODUCT_VIEW)],
    },
    controller.list,
  );

  router.get<{ Params: UuidParam }>(
    '/products/:id',
    {
      schema: {
        tags: ['products'],
        summary: 'Get a product',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        response: { 200: successEnvelope(productResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PRODUCT_VIEW)],
    },
    controller.getById,
  );

  router.post<{ Body: CreateProductInput }>(
    '/products',
    {
      schema: {
        tags: ['products'],
        summary: 'Create a product (with initial price and stock)',
        security: [{ bearerAuth: [] }],
        body: createProductSchema,
        response: { 201: successEnvelope(productResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PRODUCT_CREATE)],
    },
    controller.create,
  );

  router.patch<{ Params: UuidParam; Body: UpdateProductInput }>(
    '/products/:id',
    {
      schema: {
        tags: ['products'],
        summary: 'Update a product',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        body: updateProductSchema,
        response: { 200: successEnvelope(productResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PRODUCT_UPDATE)],
    },
    controller.update,
  );

  router.delete<{ Params: UuidParam }>(
    '/products/:id',
    {
      schema: {
        tags: ['products'],
        summary: 'Soft-delete a product',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        response: commonErrorResponses,
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.PRODUCT_DELETE)],
    },
    controller.remove,
  );
}
