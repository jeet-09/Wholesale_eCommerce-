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
import type { CategoryController } from './category.controller';
import {
  categoryResponseSchema,
  createCategorySchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from './category.schemas';
import type {
  CreateCategoryInput,
  ListCategoriesQueryInput,
  UpdateCategoryInput,
} from './category.schemas';

export function registerCategoryRoutes(app: FastifyInstance, controller: CategoryController): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.get<{ Querystring: ListCategoriesQueryInput }>(
    '/categories',
    {
      schema: {
        tags: ['categories'],
        summary: 'List categories',
        security: [{ bearerAuth: [] }],
        querystring: listCategoriesQuerySchema,
        response: { 200: paginatedEnvelope(categoryResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.CATEGORY_VIEW)],
    },
    controller.list,
  );

  router.get<{ Params: UuidParam }>(
    '/categories/:id',
    {
      schema: {
        tags: ['categories'],
        summary: 'Get a category',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        response: { 200: successEnvelope(categoryResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.CATEGORY_VIEW)],
    },
    controller.getById,
  );

  router.post<{ Body: CreateCategoryInput }>(
    '/categories',
    {
      schema: {
        tags: ['categories'],
        summary: 'Create a category',
        security: [{ bearerAuth: [] }],
        body: createCategorySchema,
        response: { 201: successEnvelope(categoryResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.CATEGORY_CREATE)],
    },
    controller.create,
  );

  router.patch<{ Params: UuidParam; Body: UpdateCategoryInput }>(
    '/categories/:id',
    {
      schema: {
        tags: ['categories'],
        summary: 'Update a category',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        body: updateCategorySchema,
        response: { 200: successEnvelope(categoryResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.CATEGORY_UPDATE)],
    },
    controller.update,
  );

  router.delete<{ Params: UuidParam }>(
    '/categories/:id',
    {
      schema: {
        tags: ['categories'],
        summary: 'Soft-delete a category',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        response: commonErrorResponses,
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.CATEGORY_DELETE)],
    },
    controller.remove,
  );
}
