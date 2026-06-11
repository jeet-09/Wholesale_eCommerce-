import type { preHandlerHookHandler } from 'fastify';

import type { RequestContext } from '../common/types';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Authenticated request context, attached by the `authenticate` hook.
     * Undefined on public routes that did not run authentication.
     */
    ctx?: RequestContext;
    /** Internal state for the idempotency hook (set on guarded write routes). */
    idempotencyState?: {
      key: string;
      recordId: string;
      replayed: boolean;
    };
  }

  interface FastifyInstance {
    /** preHandler: verifies the JWT and attaches `request.ctx`. */
    authenticate: preHandlerHookHandler;
    /** Factory preHandler: enforces a required permission (default-deny RBAC). */
    authorize: (permission: string) => preHandlerHookHandler;
    /** Factory preHandler: idempotency guard for side-effecting writes. */
    idempotent: () => preHandlerHookHandler;
  }
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string; email: string };
    user: { sub: string; email: string; iat: number; exp: number };
  }
}

export {};
