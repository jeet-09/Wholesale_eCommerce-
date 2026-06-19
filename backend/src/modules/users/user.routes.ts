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
import type { UserController } from './user.controller';
import {
  createUserSchema,
  listUsersQuerySchema,
  setPasswordSchema,
  updateUserSchema,
  userResponseSchema,
} from './user.schemas';
import type {
  CreateUserInput,
  ListUsersQueryInput,
  SetPasswordInput,
  UpdateUserInput,
} from './user.schemas';

export function registerUserRoutes(app: FastifyInstance, controller: UserController): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.get<{ Querystring: ListUsersQueryInput }>(
    '/users',
    {
      schema: {
        tags: ['users'],
        summary: 'List users',
        security: [{ bearerAuth: [] }],
        querystring: listUsersQuerySchema,
        response: { 200: paginatedEnvelope(userResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.USER_VIEW)],
    },
    controller.list,
  );

  router.get<{ Params: UuidParam }>(
    '/users/:id',
    {
      schema: {
        tags: ['users'],
        summary: 'Get a user by id',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        response: { 200: successEnvelope(userResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.USER_VIEW)],
    },
    controller.getById,
  );

  router.post<{ Body: CreateUserInput }>(
    '/users',
    {
      schema: {
        tags: ['users'],
        summary: 'Create a user and assign a role',
        security: [{ bearerAuth: [] }],
        body: createUserSchema,
        response: { 201: successEnvelope(userResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.USER_CREATE)],
    },
    controller.create,
  );

  router.patch<{ Params: UuidParam; Body: UpdateUserInput }>(
    '/users/:id',
    {
      schema: {
        tags: ['users'],
        summary: 'Update a user profile',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        body: updateUserSchema,
        response: { 200: successEnvelope(userResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.USER_UPDATE)],
    },
    controller.update,
  );

  router.post<{ Params: UuidParam }>(
    '/users/:id/suspend',
    {
      schema: {
        tags: ['users'],
        summary: 'Suspend a user',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        response: { 200: successEnvelope(userResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.USER_SUSPEND)],
    },
    controller.suspend,
  );

  router.post<{ Params: UuidParam }>(
    '/users/:id/reactivate',
    {
      schema: {
        tags: ['users'],
        summary: 'Reactivate a suspended user',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        response: { 200: successEnvelope(userResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.USER_SUSPEND)],
    },
    controller.reactivate,
  );

  router.post<{ Params: UuidParam; Body: SetPasswordInput }>(
    '/users/:id/password',
    {
      schema: {
        tags: ['users'],
        summary: "Set a user's password (admin)",
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        body: setPasswordSchema,
        response: { 200: successEnvelope(userResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.USER_RESET_PASSWORD)],
    },
    controller.setPassword,
  );
}
