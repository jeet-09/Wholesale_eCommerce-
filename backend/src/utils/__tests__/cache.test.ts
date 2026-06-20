import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TtlCache } from '../cache';

describe('TtlCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('rejects invalid options', () => {
    expect(() => new TtlCache({ ttlMs: 0, maxEntries: 10 })).toThrow();
    expect(() => new TtlCache({ ttlMs: -1, maxEntries: 10 })).toThrow();
    expect(() => new TtlCache({ ttlMs: 1000, maxEntries: 0 })).toThrow();
    expect(() => new TtlCache({ ttlMs: 1000, maxEntries: 1.5 })).toThrow();
  });

  it('stores and returns values, and reports misses as undefined', () => {
    const cache = new TtlCache<number>({ ttlMs: 1000, maxEntries: 10 });
    expect(cache.get('a')).toBeUndefined();
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
  });

  it('caches null/falsey values distinctly from a miss', () => {
    const cache = new TtlCache<string | null>({ ttlMs: 1000, maxEntries: 10 });
    cache.set('k', null);
    expect(cache.get('k')).toBeNull();
    expect(cache.get('missing')).toBeUndefined();
  });

  it('expires entries after the TTL elapses', () => {
    const cache = new TtlCache<number>({ ttlMs: 1000, maxEntries: 10 });
    cache.set('a', 1);

    vi.advanceTimersByTime(999);
    expect(cache.get('a')).toBe(1);

    vi.advanceTimersByTime(2);
    expect(cache.get('a')).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it('refreshes the TTL when a key is re-set', () => {
    const cache = new TtlCache<number>({ ttlMs: 1000, maxEntries: 10 });
    cache.set('a', 1);
    vi.advanceTimersByTime(800);
    cache.set('a', 2);
    vi.advanceTimersByTime(800);
    expect(cache.get('a')).toBe(2);
  });

  it('evicts the oldest entries when exceeding maxEntries (FIFO)', () => {
    const cache = new TtlCache<number>({ ttlMs: 10_000, maxEntries: 2 });
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
    expect(cache.size).toBe(2);
  });

  describe('getOrLoad', () => {
    it('loads on a miss, then serves from cache without re-invoking the loader', async () => {
      const cache = new TtlCache<number>({ ttlMs: 1000, maxEntries: 10 });
      const loader = vi.fn().mockResolvedValue(42);

      expect(await cache.getOrLoad('a', loader)).toBe(42);
      expect(await cache.getOrLoad('a', loader)).toBe(42);
      expect(loader).toHaveBeenCalledTimes(1);
    });

    it('reloads after the entry expires', async () => {
      const cache = new TtlCache<number>({ ttlMs: 1000, maxEntries: 10 });
      const loader = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);

      expect(await cache.getOrLoad('a', loader)).toBe(1);
      vi.advanceTimersByTime(1001);
      expect(await cache.getOrLoad('a', loader)).toBe(2);
      expect(loader).toHaveBeenCalledTimes(2);
    });

    it('does not cache a rejected loader result', async () => {
      const cache = new TtlCache<number>({ ttlMs: 1000, maxEntries: 10 });
      const loader = vi
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(7);

      await expect(cache.getOrLoad('a', loader)).rejects.toThrow('boom');
      expect(cache.get('a')).toBeUndefined();
      expect(await cache.getOrLoad('a', loader)).toBe(7);
    });
  });

  it('supports delete and clear', () => {
    const cache = new TtlCache<number>({ ttlMs: 1000, maxEntries: 10 });
    cache.set('a', 1);
    cache.set('b', 2);

    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);

    cache.clear();
    expect(cache.get('b')).toBeUndefined();
    expect(cache.size).toBe(0);
  });
});
