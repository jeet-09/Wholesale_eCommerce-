import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app';
import { loadEnv } from '../config/env';
import type { Database } from '../database/prisma';

/** Encode an object as a base64url JWT segment (for crafting attack tokens). */
function b64url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

const ME_URL = '/api/v1/auth/me';

let app: FastifyInstance;

beforeAll(async () => {
  const env = loadEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db?schema=public',
    JWT_ACCESS_SECRET: 'a'.repeat(40),
    JWT_REFRESH_SECRET: 'b'.repeat(40),
    COOKIE_SECRET: 'c'.repeat(40),
    CORS_ORIGINS: 'http://localhost:3000',
    SWAGGER_ENABLED: 'false',
    // High so injected requests in this suite never trip the limiter.
    RATE_LIMIT_MAX: '100000',
    AUTH_RATE_LIMIT_MAX: '100000',
  });

  // The plugins/routes wire up without touching the DB at boot; the unauth paths
  // we exercise fail before any repository call, so a stub client is enough.
  const db = {} as unknown as Database;
  app = await buildApp({ env, db });
});

afterAll(async () => {
  await app?.close();
});

describe('security smoke test', () => {
  it('boots and serves the liveness probe', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
  });

  it('signs access tokens with the pinned HS256 algorithm', () => {
    const token = app.jwt.sign({ sub: 'user-1', email: 'a@b.c' });
    const [headerPart] = token.split('.');
    const header = JSON.parse(Buffer.from(String(headerPart), 'base64url').toString()) as {
      alg: string;
    };
    expect(header.alg).toBe('HS256');
  });

  it('rejects a request with no token (default-deny)', async () => {
    const res = await app.inject({ method: 'GET', url: ME_URL });
    expect(res.statusCode).toBe(401);
  });

  it('rejects an "alg: none" forged token (algorithm-confusion attack)', async () => {
    const forged = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url({
      sub: 'attacker',
      email: 'evil@example.com',
    })}.`;

    const res = await app.inject({
      method: 'GET',
      url: ME_URL,
      headers: { authorization: `Bearer ${forged}` },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects a malformed/garbage token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: ME_URL,
      headers: { authorization: 'Bearer not.a.real.jwt' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns the standard error envelope (no internal leakage) on auth failure', async () => {
    const res = await app.inject({ method: 'GET', url: ME_URL });
    const body: { success: boolean; error?: { code: string; message: string } } = res.json();
    expect(body.success).toBe(false);
    expect(body.error?.code).toBeDefined();
    // Never expose stack traces or internals.
    expect(JSON.stringify(body)).not.toMatch(/stack|node_modules|at Object/i);
  });
});
