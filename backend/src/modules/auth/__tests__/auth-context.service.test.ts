import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthContextMeta } from '../../../middleware/auth';
import { TtlCache } from '../../../utils/cache';
import type { UserRepository } from '../../users/user.repository';
import type { AuthUser } from '../../users/user.types';
import { AuthContextService, type AuthIdentity } from '../auth-context.service';

function makeAuthUser(overrides: Partial<Record<string, unknown>> = {}): AuthUser {
  return {
    id: 'user-1',
    email: 'restaurant@demo.local',
    status: 'ACTIVE',
    userRoles: [
      {
        role: {
          name: 'RESTAURANT',
          rolePermissions: [
            { permission: { key: 'order:create' } },
            { permission: { key: 'order:view' } },
          ],
        },
      },
    ],
    memberships: [
      { organization: { id: 'org-1', vendor: null, restaurant: { id: 'rest-1' } } },
    ],
    ...overrides,
  } as unknown as AuthUser;
}

function meta(requestId: string): AuthContextMeta {
  return { requestId, ipAddress: `ip-${requestId}`, userAgent: `ua-${requestId}` };
}

function setup() {
  const findWithAuthData = vi.fn();
  const users = { findWithAuthData } as unknown as UserRepository;
  const cache = new TtlCache<AuthIdentity>({ ttlMs: 30_000, maxEntries: 100 });
  const service = new AuthContextService(users, cache);
  return { service, findWithAuthData };
}

describe('AuthContextService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps roles, permissions and the org binding from the database', async () => {
    const { service, findWithAuthData } = setup();
    findWithAuthData.mockResolvedValue(makeAuthUser());

    const ctx = await service.load('user-1', meta('req-1'));

    expect(ctx).not.toBeNull();
    expect(ctx?.userId).toBe('user-1');
    expect(ctx?.roles).toEqual(['RESTAURANT']);
    expect(ctx?.permissions).toEqual(['order:create', 'order:view']);
    expect(ctx?.organizationId).toBe('org-1');
    expect(ctx?.restaurantId).toBe('rest-1');
    expect(ctx?.vendorId).toBeNull();
  });

  it('serves repeat loads from cache but always merges fresh per-request meta', async () => {
    const { service, findWithAuthData } = setup();
    findWithAuthData.mockResolvedValue(makeAuthUser());

    const first = await service.load('user-1', meta('req-1'));
    const second = await service.load('user-1', meta('req-2'));

    // Identity came from the DB only once...
    expect(findWithAuthData).toHaveBeenCalledTimes(1);
    // ...yet the volatile request metadata reflects each individual request.
    expect(first?.requestId).toBe('req-1');
    expect(first?.ipAddress).toBe('ip-req-1');
    expect(second?.requestId).toBe('req-2');
    expect(second?.ipAddress).toBe('ip-req-2');
    expect(second?.userAgent).toBe('ua-req-2');
    // Stable identity is identical across requests.
    expect(second?.roles).toEqual(first?.roles);
  });

  it('reloads from the database after invalidation', async () => {
    const { service, findWithAuthData } = setup();
    findWithAuthData.mockResolvedValue(makeAuthUser());

    await service.load('user-1', meta('req-1'));
    service.invalidate('user-1');
    await service.load('user-1', meta('req-2'));

    expect(findWithAuthData).toHaveBeenCalledTimes(2);
  });

  it('reloads from the database after the TTL expires', async () => {
    const { service, findWithAuthData } = setup();
    findWithAuthData.mockResolvedValue(makeAuthUser());

    await service.load('user-1', meta('req-1'));
    vi.advanceTimersByTime(30_001);
    await service.load('user-1', meta('req-2'));

    expect(findWithAuthData).toHaveBeenCalledTimes(2);
  });

  it('returns null for inactive users and never caches them', async () => {
    const { service, findWithAuthData } = setup();
    findWithAuthData.mockResolvedValue(makeAuthUser({ status: 'SUSPENDED' }));

    expect(await service.load('user-1', meta('req-1'))).toBeNull();
    expect(await service.load('user-1', meta('req-2'))).toBeNull();
    // No caching of the negative result — each attempt re-checks the database.
    expect(findWithAuthData).toHaveBeenCalledTimes(2);
  });

  it('returns null for a missing user', async () => {
    const { service, findWithAuthData } = setup();
    findWithAuthData.mockResolvedValue(null);

    expect(await service.load('ghost', meta('req-1'))).toBeNull();
  });
});
