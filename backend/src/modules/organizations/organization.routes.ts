import { z } from 'zod';
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
import type { OrganizationController } from './organization.controller';
import {
  addAddressSchema,
  addMemberSchema,
  addressResponseSchema,
  listOrganizationsQuerySchema,
  memberResponseSchema,
  organizationResponseSchema,
  updateOrganizationSchema,
} from './organization.schemas';
import type {
  AddAddressInput,
  AddMemberInput,
  ListOrganizationsQueryInput,
  UpdateOrganizationInput,
} from './organization.schemas';

export function registerOrganizationRoutes(
  app: FastifyInstance,
  controller: OrganizationController,
): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  router.get<{ Querystring: ListOrganizationsQueryInput }>(
    '/organizations',
    {
      schema: {
        tags: ['organizations'],
        summary: 'List organizations',
        security: [{ bearerAuth: [] }],
        querystring: listOrganizationsQuerySchema,
        response: { 200: paginatedEnvelope(organizationResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.ORGANIZATION_VIEW)],
    },
    controller.list,
  );

  router.get<{ Params: UuidParam }>(
    '/organizations/:id',
    {
      schema: {
        tags: ['organizations'],
        summary: 'Get an organization',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        response: { 200: successEnvelope(organizationResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.ORGANIZATION_VIEW)],
    },
    controller.getById,
  );

  router.patch<{ Params: UuidParam; Body: UpdateOrganizationInput }>(
    '/organizations/:id',
    {
      schema: {
        tags: ['organizations'],
        summary: 'Update an organization',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        body: updateOrganizationSchema,
        response: { 200: successEnvelope(organizationResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.ORGANIZATION_UPDATE)],
    },
    controller.update,
  );

  router.get<{ Params: UuidParam }>(
    '/organizations/:id/members',
    {
      schema: {
        tags: ['organizations'],
        summary: 'List organization members',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        response: {
          200: successEnvelope(z.array(memberResponseSchema)),
          ...commonErrorResponses,
        },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.MEMBER_VIEW)],
    },
    controller.listMembers,
  );

  router.post<{ Params: UuidParam; Body: AddMemberInput }>(
    '/organizations/:id/members',
    {
      schema: {
        tags: ['organizations'],
        summary: 'Add a member to an organization',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        body: addMemberSchema,
        response: { 201: successEnvelope(memberResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.MEMBER_CREATE)],
    },
    controller.addMember,
  );

  router.get<{ Params: UuidParam }>(
    '/organizations/:id/addresses',
    {
      schema: {
        tags: ['organizations'],
        summary: 'List organization addresses',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        response: {
          200: successEnvelope(z.array(addressResponseSchema)),
          ...commonErrorResponses,
        },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.ORGANIZATION_VIEW)],
    },
    controller.listAddresses,
  );

  router.post<{ Params: UuidParam; Body: AddAddressInput }>(
    '/organizations/:id/addresses',
    {
      schema: {
        tags: ['organizations'],
        summary: 'Add an address to an organization',
        security: [{ bearerAuth: [] }],
        params: uuidParamSchema,
        body: addAddressSchema,
        response: { 201: successEnvelope(addressResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate, app.authorize(PERMISSIONS.ORGANIZATION_UPDATE)],
    },
    controller.addAddress,
  );
}
