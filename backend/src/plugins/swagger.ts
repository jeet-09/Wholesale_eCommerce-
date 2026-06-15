import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fp from 'fastify-plugin';
import { jsonSchemaTransform } from 'fastify-type-provider-zod';
import type { FastifyInstance } from 'fastify';

import type { Env } from '../config/env';
import { API_PREFIX } from '../common/constants';

interface SwaggerOptions {
  env: Env;
}

/**
 * Auto-generated OpenAPI 3 docs from the Zod schemas (README → OpenAPI/Swagger).
 * Because the spec derives from the same Zod schemas used for validation, the
 * docs can never drift from the code. UI at /docs, raw spec at /docs/json.
 */
async function swaggerPlugin(app: FastifyInstance, options: SwaggerOptions): Promise<void> {
  if (!options.env.SWAGGER_ENABLED) {
    return;
  }

  await app.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'B2B Restaurant Procurement Platform API',
        description:
          'Single versioned API consumed by web, admin, and future mobile/partner clients.',
        version: '1.0.0',
      },
      servers: [{ url: '/', description: 'Current host' }],
      tags: [
        { name: 'auth', description: 'Authentication & sessions' },
        { name: 'users', description: 'User management' },
        { name: 'organizations', description: 'Organizations & members' },
        { name: 'vendors', description: 'Vendor profiles' },
        { name: 'restaurants', description: 'Restaurant profiles' },
        { name: 'categories', description: 'Product categories' },
        { name: 'products', description: 'Master product catalog (admin-owned)' },
        { name: 'pricing', description: 'Selling price (computed average + transport, admin override)' },
        { name: 'offers', description: 'Vendor price + stock offers' },
        { name: 'cart', description: 'Restaurant carts' },
        { name: 'orders', description: 'Orders & fulfilment lifecycle' },
        { name: 'payments', description: 'Advance payment proof & verification' },
        { name: 'vendor-performance', description: 'Vendor scorecards & ratings' },
        { name: 'vendor-calls', description: 'Administration ↔ vendor call logs' },
        { name: 'analytics', description: 'Role-scoped dashboards' },
        { name: 'notifications', description: 'In-app notifications' },
        { name: 'audit', description: 'Audit logs' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true },
  });

  app.log.info(`Swagger UI available at /docs (API base ${API_PREFIX})`);
}

export default fp(swaggerPlugin, { name: 'swagger' });
