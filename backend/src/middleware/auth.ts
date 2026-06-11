import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { ForbiddenError, UnauthenticatedError } from '../common/errors';
import type { RequestContext } from '../common/types';

export interface AuthContextMeta {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Loads the full authenticated context for a verified user id. Implemented in
 * the auth module and injected here (DI) so this cross-cutting hook has no
 * dependency on a concrete repository.
 */
export interface AuthContextLoader {
  load(userId: string, meta: AuthContextMeta): Promise<RequestContext | null>;
}

interface AuthOptions {
  loader: AuthContextLoader;
}

function extractUserAgent(request: FastifyRequest): string | null {
  return request.headers['user-agent'] ?? null;
}

/**
 * Auth + RBAC, applied centrally as hooks (never ad-hoc in handlers) — README →
 * Authorization, TECHNICAL-DETAILS.MD §9. Default-deny: a route is private
 * unless explicitly left public.
 */
async function authPlugin(app: FastifyInstance, options: AuthOptions): Promise<void> {
  const { loader } = options;

  app.decorate('authenticate', async function authenticate(
    request: FastifyRequest,
  ): Promise<void> {
    // Throws FST_JWT_* on missing/expired/invalid token → mapped centrally.
    await request.jwtVerify();

    const ctx = await loader.load(request.user.sub, {
      requestId: request.id,
      ipAddress: request.ip ?? null,
      userAgent: extractUserAgent(request),
    });

    if (!ctx) {
      throw new UnauthenticatedError('Session is no longer valid');
    }

    request.ctx = ctx;
  });

  app.decorate('authorize', function authorizeFactory(permission: string) {
    return async function authorize(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
      if (!request.ctx) {
        throw new UnauthenticatedError();
      }
      if (!request.ctx.permissions.includes(permission)) {
        throw new ForbiddenError(`Missing required permission: ${permission}`);
      }
    };
  });
}

export default fp(authPlugin, { name: 'auth', dependencies: ['jwt'] });
