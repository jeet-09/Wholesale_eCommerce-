import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import {
  ConflictError,
  IdempotencyKeyReusedError,
  UnauthenticatedError,
  ValidationError,
} from '../common/errors';
import { IDEMPOTENCY_KEY_HEADER, IDEMPOTENCY_TTL_HOURS } from '../common/constants';
import { hashRequestPayload } from '../utils/crypto';

export interface IdempotencyRecord {
  id: string;
  status: 'IN_PROGRESS' | 'COMPLETED';
  requestHash: string;
  responseStatus: number | null;
  responseBody: unknown;
}

/**
 * Persistence contract for the idempotency guard, injected at the composition
 * root (DATABASE.md idempotency_keys). Implemented by the idempotency module.
 */
export interface IdempotencyStore {
  find(userId: string, key: string): Promise<IdempotencyRecord | null>;
  create(input: {
    userId: string;
    key: string;
    endpoint: string;
    requestHash: string;
    expiresAt: Date;
  }): Promise<IdempotencyRecord>;
  complete(id: string, responseStatus: number, responseBody: unknown): Promise<void>;
  delete(id: string): Promise<void>;
}

interface IdempotencyOptions {
  store: IdempotencyStore;
}

function readKeyHeader(request: FastifyRequest): string | null {
  const header = request.headers[IDEMPOTENCY_KEY_HEADER];
  if (Array.isArray(header)) {
    return header[0] ?? null;
  }
  return header ?? null;
}

/**
 * Decorates `app.idempotent` — a preHandler for side-effecting writes (e.g.
 * order creation). On first use it records the key IN_PROGRESS; on retry it
 * replays the cached response (same payload) or rejects a reused key with a
 * different payload (README → Idempotency; TECHNICAL-DETAILS.MD §7).
 */
async function idempotencyPlugin(app: FastifyInstance, options: IdempotencyOptions): Promise<void> {
  const { store } = options;

  // Persist the cached response once the handler has produced it.
  app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
    const state = request.idempotencyState;
    if (!state || state.replayed) {
      return payload;
    }

    if (reply.statusCode >= 200 && reply.statusCode < 300) {
      let parsed: unknown = null;
      if (typeof payload === 'string') {
        try {
          parsed = JSON.parse(payload);
        } catch {
          parsed = null;
        }
      }
      await store.complete(state.recordId, reply.statusCode, parsed);
    } else {
      // Failed: release the slot so the client can safely retry.
      await store.delete(state.recordId);
    }
    return payload;
  });

  app.decorate('idempotent', function idempotent() {
    return async function guard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
      if (!request.ctx) {
        throw new UnauthenticatedError();
      }

      const key = readKeyHeader(request);
      if (!key) {
        throw new ValidationError('Missing required Idempotency-Key header', [
          { field: 'Idempotency-Key', message: 'This header is required for this operation' },
        ]);
      }

      const requestHash = hashRequestPayload(request.body);
      const existing = await store.find(request.ctx.userId, key);

      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new IdempotencyKeyReusedError();
        }
        if (existing.status === 'COMPLETED') {
          request.idempotencyState = { key, recordId: existing.id, replayed: true };
          await reply.code(existing.responseStatus ?? 200).send(existing.responseBody);
          return;
        }
        throw new ConflictError('A request with this Idempotency-Key is already in progress');
      }

      const expiresAt = new Date(Date.now() + IDEMPOTENCY_TTL_HOURS * 60 * 60 * 1000);
      const created = await store.create({
        userId: request.ctx.userId,
        key,
        endpoint: `${request.method} ${request.routeOptions?.url ?? request.url}`,
        requestHash,
        expiresAt,
      });
      request.idempotencyState = { key, recordId: created.id, replayed: false };
    };
  });
}

export default fp(idempotencyPlugin, { name: 'idempotency', dependencies: ['auth'] });
