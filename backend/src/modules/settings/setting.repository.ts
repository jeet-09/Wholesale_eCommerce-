import { Prisma } from '@prisma/client';

import { BaseRepository } from '../../database/base.repository';
import type { PrismaExecutor } from '../../database/prisma';
import { TtlCache } from '../../utils/cache';

/**
 * Platform settings are near-static config (GST %, delivery/advance charges…)
 * read on hot paths such as order pricing, yet there is no write API for them —
 * they change only via seeding or a direct DB edit. A short TTL therefore lets
 * us avoid repeated reads while still picking up out-of-band edits within a
 * minute. Both present and absent values are cached (so missing keys don't keep
 * hitting the DB).
 */
const SETTINGS_TTL_MS = 60_000;
const SETTINGS_MAX_ENTRIES = 128;

/**
 * Read access to the `settings` table (SYSTEM CONFIGURATION). Values are stored
 * as strings with a declared type; callers coerce as needed.
 */
export class SettingRepository extends BaseRepository {
  private readonly cache = new TtlCache<string | null>({
    ttlMs: SETTINGS_TTL_MS,
    maxEntries: SETTINGS_MAX_ENTRIES,
  });

  async get(key: string, tx?: PrismaExecutor): Promise<string | null> {
    return this.cache.getOrLoad(key, async () => {
      const row = await this.exec(tx).setting.findFirst({
        where: { key, ...this.notDeleted },
        select: { value: true },
      });
      return row?.value ?? null;
    });
  }

  /** Drop cached settings — call this whenever a settings write is introduced. */
  invalidate(key?: string): void {
    if (key === undefined) {
      this.cache.clear();
      return;
    }
    this.cache.delete(key);
  }

  async getNumber(key: string, fallback: number, tx?: PrismaExecutor): Promise<Prisma.Decimal> {
    const value = await this.get(key, tx);
    if (value === null) {
      return new Prisma.Decimal(fallback);
    }
    try {
      return new Prisma.Decimal(value);
    } catch {
      return new Prisma.Decimal(fallback);
    }
  }
}
