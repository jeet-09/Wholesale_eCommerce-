import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import underPressure from '@fastify/under-pressure';
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

import type { Env } from '../config/env';
import { fail } from '../common/responses';
import { ERROR_CODES } from '../common/errors';

interface SecurityOptions {
  env: Env;
}

/**
 * Event-loop lag (ms) above which the process is considered overloaded and
 * starts shedding load with 503s. Conservative so it only trips under genuine
 * saturation (e.g. an application-layer DoS), never normal traffic.
 */
const MAX_EVENT_LOOP_DELAY_MS = 1_000;
const MAX_EVENT_LOOP_UTILIZATION = 0.98;

/**
 * Transport/network security applied to every response (README → Security):
 *  - Helmet sets secure HTTP headers.
 *  - CORS uses an explicit allow-list (never `*` in production).
 *  - Rate limiting blunts abuse; auth routes are limited harder (see routes).
 *  - Under-pressure sheds load (503) when the event loop saturates, so a flood
 *    degrades gracefully instead of crashing the process.
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

  await app.register(underPressure, {
    maxEventLoopDelay: MAX_EVENT_LOOP_DELAY_MS,
    maxEventLoopUtilization: MAX_EVENT_LOOP_UTILIZATION,
    // We expose our own /health and /ready probes, so don't add another route.
    exposeStatusRoute: false,
    retryAfter: 50,
    // Reply with our standard envelope (and a Retry-After header) when shedding.
    pressureHandler: (request, reply) => {
      void reply
        .code(503)
        .send(
          fail(
            ERROR_CODES.SERVICE_UNAVAILABLE,
            'Service is temporarily overloaded, please retry shortly',
            [],
            request.id,
          ),
        );
    },
  });
}

export default fp(securityPlugin, { name: 'security' });
