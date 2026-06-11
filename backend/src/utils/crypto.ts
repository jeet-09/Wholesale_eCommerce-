import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Token helpers. Refresh/reset/verification tokens are stored HASHED, never raw
 * (RULES.md §8; DATABASE.md refresh_tokens). We hand the raw token to the client
 * once and persist only its SHA-256 hash.
 */

export function generateRawToken(byteLength = 48): string {
  return randomBytes(byteLength).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * HMAC-SHA256 used to hash refresh tokens with a server-side secret (pepper),
 * so a database leak alone cannot be used to forge a valid token.
 */
export function hmacSha256(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

/** Constant-time comparison of two hex digests to avoid timing leaks. */
export function safeEqualHex(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'hex');
  const bufferB = Buffer.from(b, 'hex');
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

/** Stable hash of a request body for the idempotency guard. */
export function hashRequestPayload(payload: unknown): string {
  return sha256(JSON.stringify(payload ?? null));
}
