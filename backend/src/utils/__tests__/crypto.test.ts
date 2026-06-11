import { describe, expect, it } from 'vitest';

import {
  generateRawToken,
  hashRequestPayload,
  hmacSha256,
  safeEqualHex,
  sha256,
} from '../crypto';

describe('crypto helpers', () => {
  it('sha256 is deterministic and 64 hex chars', () => {
    const a = sha256('hello');
    const b = sha256('hello');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256('hello')).not.toBe(sha256('world'));
  });

  it('hmacSha256 depends on the secret', () => {
    expect(hmacSha256('token', 's1')).not.toBe(hmacSha256('token', 's2'));
    expect(hmacSha256('token', 's1')).toBe(hmacSha256('token', 's1'));
  });

  it('safeEqualHex compares digests in constant time', () => {
    const digest = sha256('same');
    expect(safeEqualHex(digest, digest)).toBe(true);
    expect(safeEqualHex(sha256('a'), sha256('b'))).toBe(false);
    expect(safeEqualHex('aa', 'aabb')).toBe(false);
  });

  it('generateRawToken returns unique url-safe tokens', () => {
    const t1 = generateRawToken();
    const t2 = generateRawToken();
    expect(t1).not.toBe(t2);
    expect(t1).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('hashRequestPayload is stable per payload', () => {
    expect(hashRequestPayload({ a: 1 })).toBe(hashRequestPayload({ a: 1 }));
    expect(hashRequestPayload({ a: 1 })).not.toBe(hashRequestPayload({ a: 2 }));
    expect(hashRequestPayload(undefined)).toBe(hashRequestPayload(null));
  });
});
