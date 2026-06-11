import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

import type { Env } from '../config/env';
import { fail } from '../common/responses';
import { ERROR_CODES } from '../common/errors';

interface SecurityOptions {
  env: Env;
}

/**
 * Transport/network security applied to every response (README → Security):
 *  - Helmet sets secure HTTP headers.
 *  - CORS uses an explicit allow-list (never `*` in production).
 *  - Rate limiting blunts abuse; auth routes are limited harder (see routes).
 */
async function securityPlugin(app: FastifyInstance, options: SecurityOptions): Promise<void> {
  const { env } = options;

  await app.register(helmet, {
    contentSecurityPolicy: env.NODE_ENV === 'production',
  });

  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    exposedHeaders: ['x-request-id'],
  });

  await app.register(rateLimit, {
    global: true,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    // Return our standard error envelope on 429 instead of the default shape.
    errorResponseBuilder: (request, context) =>
      fail(
        ERROR_CODES.RATE_LIMITED,
        `Rate limit exceeded, retry in ${Math.ceil(context.ttl / 1000)}s`,
        [],
        request.id,
      ),
  });
}

export default fp(securityPlugin, { name: 'security' });
