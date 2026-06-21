import { randomUUID } from 'node:crypto';

import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { API_PREFIX } from './common/constants';
import type { Env } from './config/env';
import type { Database } from './database/prisma';
import { buildContainer } from './container';

import securityPlugin from './plugins/security';
import swaggerPlugin from './plugins/swagger';
import jwtPlugin from './plugins/jwt';
import requestContextPlugin from './plugins/request-context';
import errorHandlerPlugin from './plugins/error-handler';
import authPlugin from './middleware/auth';
import idempotencyPlugin from './middleware/idempotency';

import { registerAuthRoutes } from './modules/auth/auth.routes';
import { registerUserRoutes } from './modules/users/user.routes';
import { registerOrganizationRoutes } from './modules/organizations/organization.routes';
import { registerVendorRoutes } from './modules/vendors/vendor.routes';
import { registerRestaurantRoutes } from './modules/restaurants/restaurant.routes';
import { registerCategoryRoutes } from './modules/categories/category.routes';
import { registerProductRoutes } from './modules/products/product.routes';
import { registerPricingRoutes } from './modules/pricing/price.routes';
import { registerOfferRoutes } from './modules/vendor-offers/offer.routes';
import { registerCartRoutes } from './modules/cart/cart.routes';
import { registerOrderRoutes } from './modules/orders/order.routes';
import { registerPaymentRoutes } from './modules/payments/payment.routes';
import { registerPerformanceRoutes } from './modules/vendor-performance/performance.routes';
import { registerCallRoutes } from './modules/vendor-calls/call.routes';
import { registerAnalyticsRoutes } from './modules/analytics/analytics.routes';
import { registerNotificationRoutes } from './modules/notifications/notification.routes';
import { registerAuditRoutes } from './modules/audit/audit.routes';

export interface BuildAppDeps {
  env: Env;
  db: Database;
}

/**
 * Build the fully-wired Fastify instance: plugins, composition root, routes,
 * and health probes. Pure assembly — no network binding (that's server.ts), so
 * the same builder is reused by integration tests.
 */
export async function buildApp(deps: BuildAppDeps): Promise<FastifyInstance> {
  const { env, db } = deps;

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Defense-in-depth: scrub credentials/secrets from every log line. Logs
      // are often shipped to third-party sinks and retained, so a leaked token
      // or password here is a real breach. Covers request headers, the
      // Set-Cookie response header, and common sensitive field names anywhere.
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          'password',
          'newPassword',
          'currentPassword',
          'passwordHash',
          'token',
          'resetToken',
          'refreshToken',
          'accessToken',
          '*.password',
          '*.newPassword',
          '*.passwordHash',
          '*.token',
          '*.resetToken',
          '*.refreshToken',
          '*.accessToken',
        ],
        censor: '[REDACTED]',
      },
      // Pretty logs in dev; structured JSON in prod (README → Logging).
      transport:
        env.NODE_ENV === 'development'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' } }
          : undefined,
    },
    trustProxy: true,
    bodyLimit: 1_048_576, // 1 MiB
    genReqId: (req) => {
      const header = req.headers['x-request-id'];
      if (typeof header === 'string' && header.length > 0) {
        return header;
      }
      return randomUUID();
    },
  }).withTypeProvider<ZodTypeProvider>();

  // Zod drives both request validation and response serialization.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Cross-cutting plugins (order matters: jwt before auth; auth before idempotency).
  await app.register(errorHandlerPlugin);
  await app.register(requestContextPlugin);
  await app.register(securityPlugin, { env });
  await app.register(swaggerPlugin, { env });
  await app.register(jwtPlugin, { env });

  // Composition root — wire concrete implementations now that app.jwt exists.
  const container = buildContainer({
    db,
    env,
    logger: app.log,
    signer: { sign: (payload) => app.jwt.sign(payload) },
  });

  await app.register(authPlugin, { loader: container.authContextLoader });
  await app.register(idempotencyPlugin, { store: container.idempotencyStore });

  registerHealthRoutes(app, db);

  // All domain routes live under the versioned API prefix.
  await app.register(
    async (api) => {
      const c = container.controllers;
      registerAuthRoutes(api, c.auth, { authRateLimitMax: env.AUTH_RATE_LIMIT_MAX });
      registerUserRoutes(api, c.users);
      registerOrganizationRoutes(api, c.organizations);
      registerVendorRoutes(api, c.vendors);
      registerRestaurantRoutes(api, c.restaurants);
      registerCategoryRoutes(api, c.categories);
      registerProductRoutes(api, c.products);
      registerPricingRoutes(api, c.pricing);
      registerOfferRoutes(api, c.offers);
      registerCartRoutes(api, c.cart);
      registerOrderRoutes(api, c.orders);
      registerPaymentRoutes(api, c.payments);
      registerPerformanceRoutes(api, c.performance);
      registerCallRoutes(api, c.calls);
      registerAnalyticsRoutes(api, c.analytics);
      registerNotificationRoutes(api, c.notifications);
      registerAuditRoutes(api, c.audit);
    },
    { prefix: API_PREFIX },
  );

  await app.ready();
  return app;
}

/** Liveness/readiness probes for orchestrators (Docker/K8s) and load balancers. */
function registerHealthRoutes(app: FastifyInstance, db: Database): void {
  app.get('/', async () => ({
    name: 'B2B Restaurant Procurement Platform API',
    version: '1.0.0',
    docs: '/docs',
    api: API_PREFIX,
  }));

  // Liveness — process is up. No external dependencies touched.
  app.get('/health', async () => ({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  }));

  // Readiness — can we actually serve traffic (DB reachable)?
  app.get('/ready', async (_request, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch (error) {
      app.log.error({ err: error }, 'readiness check failed');
      return reply.code(503).send({ status: 'unavailable' });
    }
  });
}
