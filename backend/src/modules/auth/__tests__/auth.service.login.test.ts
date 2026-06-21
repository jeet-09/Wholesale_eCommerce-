import type { FastifyBaseLogger } from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ForbiddenError, UnauthenticatedError } from '../../../common/errors';
import type { Env } from '../../../config/env';
import type { AuthContextMeta } from '../../../middleware/auth';
import type { UserRepository } from '../../users/user.repository';
import { AuthService } from '../auth.service';

const META: AuthContextMeta = { requestId: 'req-1', ipAddress: '127.0.0.1', userAgent: 'test' };

function setup() {
  const users = {
    findByEmail: vi.fn(),
    updateLastLogin: vi.fn().mockResolvedValue(undefined),
  };
  const hasher = {
    hash: vi.fn(),
    verify: vi.fn(),
    verifyDummy: vi.fn().mockResolvedValue(undefined),
  };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as FastifyBaseLogger;
  // `never` is assignable to every dependency type; these collaborators are not
  // touched on the login paths under test (they all throw before using them).
  const none = {} as never;

  const service = new AuthService(
    none,
    { NODE_ENV: 'test' } as unknown as Env,
    users as unknown as UserRepository,
    none,
    none,
    none,
    none,
    none,
    none,
    none,
    hasher,
    none,
    logger,
  );

  return { service, users, hasher };
}

describe('AuthService.login', () => {
  let ctx: ReturnType<typeof setup>;

  beforeEach(() => {
    ctx = setup();
  });

  it('does a dummy hash comparison for an unknown email (timing-safe, no enumeration)', async () => {
    ctx.users.findByEmail.mockResolvedValue(null);

    await expect(ctx.service.login({ email: 'ghost@demo.local', password: 'secret123' }, META)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );

    // The expensive path runs even when the account doesn't exist, so an
    // attacker can't distinguish "no such user" from "wrong password" by timing.
    expect(ctx.hasher.verifyDummy).toHaveBeenCalledWith('secret123');
    expect(ctx.hasher.verify).not.toHaveBeenCalled();
  });

  it('returns the same generic error for a wrong password', async () => {
    ctx.users.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'real@demo.local',
      passwordHash: 'stored-hash',
      status: 'ACTIVE',
    });
    ctx.hasher.verify.mockResolvedValue(false);

    await expect(
      ctx.service.login({ email: 'real@demo.local', password: 'wrong-pass' }, META),
    ).rejects.toThrowError('Invalid email or password');

    expect(ctx.hasher.verify).toHaveBeenCalledWith('wrong-pass', 'stored-hash');
    expect(ctx.hasher.verifyDummy).not.toHaveBeenCalled();
  });

  it('refuses a correct password when the account is not active', async () => {
    ctx.users.findByEmail.mockResolvedValue({
      id: 'u1',
      email: 'real@demo.local',
      passwordHash: 'stored-hash',
      status: 'SUSPENDED',
    });
    ctx.hasher.verify.mockResolvedValue(true);

    await expect(
      ctx.service.login({ email: 'real@demo.local', password: 'correct-pass' }, META),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
