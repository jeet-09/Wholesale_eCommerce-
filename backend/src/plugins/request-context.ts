import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

/**
 * Request correlation + access logging (README → Logging & Observability):
 *  - echoes the request id in the `x-request-id` response header so clients and
 *    logs share one correlation id;
 *  - emits exactly one structured log line per request with method, route,
 *    status, duration, and userId (when authenticated).
 */
async function requestContextPlugin(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', (request, reply, done) => {
    void reply.header('x-request-id', request.id);
    done();
  });

  app.addHook('onResponse', (request, reply, done) => {
    request.log.info(
      {
        requestId: request.id,
        method: request.method,
        route: request.routeOptions?.url ?? request.url,
        statusCode: reply.statusCode,
        durationMs: Math.round(reply.elapsedTime),
        userId: request.ctx?.userId ?? null,
      },
      'request completed',
    );
    done();
  });
}

export default fp(requestContextPlugin, { name: 'request-context' });
