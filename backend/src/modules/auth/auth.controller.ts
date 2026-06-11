import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { API_PREFIX, REFRESH_TOKEN_COOKIE } from '../../common/constants';
import { getRequestContext } from '../../common/http';
import { ok } from '../../common/responses';
import type { Env } from '../../config/env';
import type { AuthContextMeta } from '../../middleware/auth';
import type { AuthService } from './auth.service';
import type { AuthResult } from './auth.service';
import type {
  LoginInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  RegisterInput,
} from './auth.schemas';

function buildMeta(request: FastifyRequest): AuthContextMeta {
  return {
    requestId: request.id,
    ipAddress: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  };
}

/**
 * Auth controller. Owns the HTTP-only refresh-token cookie lifecycle for web
 * clients (README → Transport & Network Security). The refresh token never
 * appears in a response body — only in the secure cookie.
 */
export class AuthController {
  constructor(
    private readonly service: AuthService,
    private readonly env: Env,
  ) {}

  private cookieOptions(expires?: Date): CookieSerializeOptions {
    const isProd = this.env.NODE_ENV === 'production';
    const options: CookieSerializeOptions = {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      path: `${API_PREFIX}/auth`,
      signed: true,
    };
    if (expires) {
      options.expires = expires;
    }
    if (this.env.COOKIE_DOMAIN) {
      options.domain = this.env.COOKIE_DOMAIN;
    }
    return options;
  }

  private setRefreshCookie(reply: FastifyReply, result: AuthResult): void {
    void reply.setCookie(
      REFRESH_TOKEN_COOKIE,
      result.refreshToken,
      this.cookieOptions(result.refreshTokenExpiresAt),
    );
  }

  private readRefreshCookie(request: FastifyRequest): string | null {
    const raw = request.cookies[REFRESH_TOKEN_COOKIE];
    if (!raw) {
      return null;
    }
    const unsigned = request.unsignCookie(raw);
    return unsigned.valid ? unsigned.value : null;
  }

  private sendAuth(reply: FastifyReply, request: FastifyRequest, result: AuthResult, status: number): void {
    this.setRefreshCookie(reply, result);
    void reply.code(status).send(
      ok(
        {
          accessToken: result.accessToken,
          tokenType: result.tokenType,
          user: result.user,
          context: result.context,
        },
        request.id,
      ),
    );
  }

  register = async (
    request: FastifyRequest<{ Body: RegisterInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const result = await this.service.register(request.body, buildMeta(request));
    this.sendAuth(reply, request, result, 201);
  };

  login = async (
    request: FastifyRequest<{ Body: LoginInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    const result = await this.service.login(request.body, buildMeta(request));
    this.sendAuth(reply, request, result, 200);
  };

  refresh = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const result = await this.service.refresh(this.readRefreshCookie(request), buildMeta(request));
    this.sendAuth(reply, request, result, 200);
  };

  logout = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await this.service.logout(this.readRefreshCookie(request));
    void reply.clearCookie(REFRESH_TOKEN_COOKIE, this.cookieOptions());
    await reply.code(200).send(ok({ message: 'Logged out' }, request.id));
  };

  me = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const data = await this.service.getMe(getRequestContext(request));
    await reply.code(200).send(ok(data, request.id));
  };

  requestPasswordReset = async (
    request: FastifyRequest<{ Body: PasswordResetRequestInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    await this.service.requestPasswordReset(request.body.email);
    await reply
      .code(200)
      .send(ok({ message: 'If the email exists, a reset link has been sent' }, request.id));
  };

  confirmPasswordReset = async (
    request: FastifyRequest<{ Body: PasswordResetConfirmInput }>,
    reply: FastifyReply,
  ): Promise<void> => {
    await this.service.confirmPasswordReset(request.body);
    await reply.code(200).send(ok({ message: 'Password has been reset' }, request.id));
  };
}
