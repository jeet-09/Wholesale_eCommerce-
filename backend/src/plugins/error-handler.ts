import fp from 'fastify-plugin';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { ERROR_CODES, isAppError } from '../common/errors';
import type { ErrorDetail } from '../common/errors';
import { fail } from '../common/responses';

function zodIssuesToDetails(error: ZodError): ErrorDetail[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/** Fastify schema validation produces a `validation` array; normalize it. */
function fastifyValidationToDetails(error: FastifyError): ErrorDetail[] {
  if (!Array.isArray(error.validation)) {
    return [];
  }
  return error.validation.map((item) => {
    const instancePath = typeof item.instancePath === 'string' ? item.instancePath : '';
    const field = instancePath.replace(/^\//, '').replace(/\//g, '.');
    return { field: field || '(root)', message: item.message ?? 'Invalid value' };
  });
}

function isJwtError(error: FastifyError): boolean {
  return typeof error.code === 'string' && error.code.startsWith('FST_JWT');
}

/**
 * One global error handler maps every throw → the standard error envelope with
 * the correct HTTP status (RULES.md §5, TECHNICAL-DETAILS.MD §5.2). Handlers
 * only throw; they never format error responses. Internals are never leaked:
 * unknown errors are logged server-side with the request id and returned as a
 * safe generic 500.
 */
async function errorHandlerPlugin(app: FastifyInstance): Promise<void> {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.id;

    if (isAppError(error)) {
      const appError = error;
      request.log.warn(
        { code: appError.code, statusCode: appError.statusCode, requestId },
        'handled domain error',
      );
      return reply
        .code(appError.statusCode)
        .send(fail(appError.code, appError.message, appError.details, requestId));
    }

    if (error instanceof ZodError) {
      return reply
        .code(422)
        .send(fail(ERROR_CODES.VALIDATION_ERROR, 'Validation failed', zodIssuesToDetails(error), requestId));
    }

    if (error.validation) {
      return reply
        .code(422)
        .send(
          fail(
            ERROR_CODES.VALIDATION_ERROR,
            'Validation failed',
            fastifyValidationToDetails(error),
            requestId,
          ),
        );
    }

    if (isJwtError(error)) {
      const expired = error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED';
      return reply
        .code(401)
        .send(
          fail(
            expired ? ERROR_CODES.TOKEN_EXPIRED : ERROR_CODES.UNAUTHENTICATED,
            expired ? 'Access token has expired' : 'Authentication required',
            [],
            requestId,
          ),
        );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return reply
          .code(409)
          .send(fail(ERROR_CODES.DUPLICATE_RESOURCE, 'Resource already exists', [], requestId));
      }
      if (error.code === 'P2025') {
        return reply
          .code(404)
          .send(fail(ERROR_CODES.NOT_FOUND, 'Resource not found', [], requestId));
      }
      if (error.code === 'P2003') {
        return reply
          .code(409)
          .send(fail(ERROR_CODES.CONFLICT, 'Related resource constraint failed', [], requestId));
      }
    }

    if (error.statusCode === 429) {
      return reply
        .code(429)
        .send(fail(ERROR_CODES.RATE_LIMITED, error.message || 'Too many requests', [], requestId));
    }

    // Unknown: log full detail server-side, return a SAFE generic message.
    request.log.error({ err: error, requestId }, 'unhandled error');
    return reply
      .code(500)
      .send(fail(ERROR_CODES.INTERNAL_ERROR, 'Something went wrong', [], requestId));
  });

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    return reply
      .code(404)
      .send(fail(ERROR_CODES.NOT_FOUND, `Route ${request.method} ${request.url} not found`, [], request.id));
  });
}

export default fp(errorHandlerPlugin, { name: 'error-handler' });
