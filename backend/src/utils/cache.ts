/**
 * Minimal in-process cache with per-entry TTL and a bounded size.
 *
 * Design choices (and their reasons):
 *  - **Lazy expiry, no timers.** Entries are checked for staleness on read, so
 *    the cache never holds an interval/timeout handle (nothing to leak, plays
 *    nicely with graceful shutdown and tests).
 *  - **Bounded with FIFO eviction.** Memory can't grow unbounded — once the map
 *    exceeds `maxEntries`, the oldest insertions are dropped first.
 *  - **Single-process only.** Each Node process keeps its own copy. That is the
 *    right tool for this single-instance deployment; a multi-instance setup
 *    would reach for a shared store (Redis) instead, with explicit cross-node
 *    invalidation. Callers must therefore invalidate on writes (see usages).
 */
export interface TtlCacheOptions {
  /** Lifetime of each entry in milliseconds (must be > 0). */
  ttlMs: number;
  /** Hard cap on live entries; oldest are evicted first (must be > 0). */
  maxEntries: number;
}

interface CacheEntry<V> {
  value: V;
  /** Epoch millis after which the entry is considered stale. */
  expiresAt: number;
}

export class TtlCache<V> {
  private readonly store = new Map<string, CacheEntry<V>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options: TtlCacheOptions) {
    if (!Number.isFinite(options.ttlMs) || options.ttlMs <= 0) {
      throw new Error('TtlCache: ttlMs must be a positive number');
    }
    if (!Number.isInteger(options.maxEntries) || options.maxEntries <= 0) {
      throw new Error('TtlCache: maxEntries must be a positive integer');
    }
    this.ttlMs = options.ttlMs;
    this.maxEntries = options.maxEntries;
  }

  /** Returns the cached value, or `undefined` when absent or expired. */
  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V): void {
    // Re-insert so an updated key counts as the newest (consistent FIFO order).
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    this.evictIfNeeded();
  }

  /**
   * Returns the cached value or computes it via `loader`, caching the result.
   * A rejected `loader` propagates and is NOT cached (failures shouldn't stick).
   * Note: `undefined` is treated as "absent", so don't cache `undefined` values.
   */
  async getOrLoad(key: string, loader: () => Promise<V>): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const value = await loader();
    this.set(key, value);
    return value;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  /** Current number of held entries (may include not-yet-evicted stale ones). */
  get size(): number {
    return this.store.size;
  }

  private evictIfNeeded(): void {
    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.store.delete(oldestKey);
    }
  }
}
