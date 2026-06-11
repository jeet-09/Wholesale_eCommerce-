import type { FastifyRequest } from 'fastify';

import { UnauthenticatedError } from './errors';
import type { RequestContext } from './types';

/**
 * Retrieve the authenticated context attached by the `authenticate` hook.
 * Throws if called on a request that did not pass authentication (a wiring bug,
 * since protected routes always run the hook first).
 */
export function getRequestContext(request: FastifyRequest): RequestContext {
  if (!request.ctx) {
    throw new UnauthenticatedError();
  }
  return request.ctx;
}
