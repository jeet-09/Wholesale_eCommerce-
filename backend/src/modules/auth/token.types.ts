/**
 * Access-token signer abstraction so AuthService never depends on Fastify.
 * The concrete implementation (composition root) wraps `@fastify/jwt`.
 */
export interface AccessTokenSigner {
  sign(payload: { sub: string; email: string }): string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}
