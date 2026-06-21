import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import type { FastifyInstance } from 'fastify';

import type { Env } from '../config/env';

interface JwtOptions {
  env: Env;
}

/**
 * Registers cookie support (for the HttpOnly refresh-token cookie on web
 * clients) and JWT signing/verification for short-lived access tokens
 * (README → Authentication; TECHNICAL-DETAILS.MD §9).
 */
async function jwtPlugin(app: FastifyInstance, options: JwtOptions): Promise<void> {
  const { env } = options;

  await app.register(cookie, {
    secret: env.COOKIE_SECRET,
  });

  await app.register(jwt, {
    secret: env.JWT_ACCESS_SECRET,
    // Pin the algorithm on BOTH sign and verify. This is the key mitigation for
    // "algorithm confusion" attacks (e.g. a forged token claiming `alg: none`
    // or swapping HS/RS): the verifier only ever accepts HS256, so a token
    // signed with anything else is rejected outright.
    sign: { algorithm: 'HS256', expiresIn: env.JWT_ACCESS_EXPIRES_IN },
    verify: { algorithms: ['HS256'] },
  });
}

export default fp(jwtPlugin, { name: 'jwt' });
