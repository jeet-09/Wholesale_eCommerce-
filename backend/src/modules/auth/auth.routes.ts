import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

import { commonErrorResponses, successEnvelope } from '../../common/schemas';
import type { AuthController } from './auth.controller';
import {
  authResponseSchema,
  loginSchema,
  meResponseSchema,
  messageResponseSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema,
} from './auth.schemas';

interface AuthRouteOptions {
  authRateLimitMax: number;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  controller: AuthController,
  options: AuthRouteOptions,
): void {
  const router = app.withTypeProvider<ZodTypeProvider>();

  // Tighter rate limit on auth endpoints to blunt brute force (README → Security).
  const authRateLimit = {
    rateLimit: { max: options.authRateLimitMax, timeWindow: '1 minute' },
  };

  router.post(
    '/auth/register',
    {
      config: authRateLimit,
      schema: {
        tags: ['auth'],
        summary: 'Register a restaurant or vendor account',
        body: registerSchema,
        response: { 201: successEnvelope(authResponseSchema), ...commonErrorResponses },
      },
    },
    controller.register,
  );

  router.post(
    '/auth/login',
    {
      config: authRateLimit,
      schema: {
        tags: ['auth'],
        summary: 'Log in and receive an access token (refresh token set as cookie)',
        body: loginSchema,
        response: { 200: successEnvelope(authResponseSchema), ...commonErrorResponses },
      },
    },
    controller.login,
  );

  router.post(
    '/auth/refresh',
    {
      config: authRateLimit,
      schema: {
        tags: ['auth'],
        summary: 'Rotate the refresh token and issue a new access token',
        response: { 200: successEnvelope(authResponseSchema), ...commonErrorResponses },
      },
    },
    controller.refresh,
  );

  router.post(
    '/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Revoke the current session',
        security: [{ bearerAuth: [] }],
        response: { 200: successEnvelope(messageResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate],
    },
    controller.logout,
  );

  router.get(
    '/auth/me',
    {
      schema: {
        tags: ['auth'],
        summary: 'Get the current user and authorization context',
        security: [{ bearerAuth: [] }],
        response: { 200: successEnvelope(meResponseSchema), ...commonErrorResponses },
      },
      preHandler: [app.authenticate],
    },
    controller.me,
  );

  router.post(
    '/auth/password-reset/request',
    {
      config: authRateLimit,
      schema: {
        tags: ['auth'],
        summary: 'Request a password reset token',
        body: passwordResetRequestSchema,
        response: { 200: successEnvelope(messageResponseSchema), ...commonErrorResponses },
      },
    },
    controller.requestPasswordReset,
  );

  router.post(
    '/auth/password-reset/confirm',
    {
      config: authRateLimit,
      schema: {
        tags: ['auth'],
        summary: 'Confirm a password reset with a token',
        body: passwordResetConfirmSchema,
        response: { 200: successEnvelope(messageResponseSchema), ...commonErrorResponses },
      },
    },
    controller.confirmPasswordReset,
  );
}
