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
    sign: { expiresIn: env.JWT_ACCESS_EXPIRES_IN },
  });
}

export default fp(jwtPlugin, { name: 'jwt' });
